import { classifyMeetingFailure } from "../../e2ee/meeting-failure";
import type { Meeting, MeetingTopic } from "../../api/domain";

export type MeetingWorkspacePhase =
  | "opening"
  | "locked"
  | "ready"
  | "temporarily_offline"
  | "syncing"
  | "unavailable"
  | "closed";

export type MeetingTextTarget =
  | { kind: "general_notes" }
  | { kind: "opening_input" }
  | { kind: "meeting_topic_note"; appearanceId: string }
  | { kind: "preparation_context"; appearanceId: string }
  | { kind: "meeting_minutes_text"; appearanceId: string };

export interface MeetingTextBinding {
  readonly target: MeetingTextTarget;
  readonly value: string;
  readonly editable: boolean;
}

export interface MeetingWorkspaceCollaborator {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly initials: string;
}

export interface MeetingWorkspaceState {
  readonly phase: MeetingWorkspacePhase;
  readonly closing?: boolean;
  readonly notice?: "forced_close" | "security_closed" | "access_changed" | "integrity_failure" | "completed_elsewhere";
  readonly meeting: DeepReadonly<Meeting> | null;
  readonly pendingChanges: boolean;
  readonly syncActivity: number;
  readonly collaborators: readonly MeetingWorkspaceCollaborator[];
}

export interface MeetingWorkspaceCollaboration {
  readonly phase: "opening" | "ready" | "temporarily_offline" | "syncing" | "unavailable";
  readonly pending: boolean;
  readonly failure?: "access" | "integrity" | "completed";
  readonly editingPaused?: boolean;
  readonly collaborators: readonly MeetingWorkspaceCollaborator[];
  subscribe?(listener: (change?: "state" | "document" | "presence") => void): () => void;
  close(): void | Promise<void>;
}

export interface MeetingWorkspaceBackend {
  load(meetingId: string, signal?: AbortSignal): Promise<{ meeting: Meeting; unlocked: boolean; collaborative?: boolean }>;
  readText?(meeting: Meeting): Meeting;
  connect?(meetingId: string): Promise<MeetingWorkspaceCollaboration>;
  complete(meetingId: string): Promise<Meeting>;
  dispose?(meetingId: string): void;
  revokeAccess?(): void;
  updateText?(meetingId: string, target: MeetingTextTarget, value: string): Promise<void>;
}

export interface MeetingWorkspace {
  readonly meetingId: string;
  readonly state: MeetingWorkspaceState;
  open(): Promise<void>;
  refresh(): Promise<void>;
  text(target: MeetingTextTarget): MeetingTextBinding;
  updateText(target: MeetingTextTarget, value: string): Promise<void>;
  complete(): Promise<void>;
  close(options?: { reason?: "navigation" | "lock" | "replacement"; discard?: boolean }): Promise<boolean>;
  cancelClose(): void;
  dismissNotice(): void;
  forceClose(reason: string): void;
  subscribe(listener: (state: MeetingWorkspaceState) => void): () => void;
}

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

let liveWorkspace: MeetingWorkspace | null = null;
const notices = new Map<string, "forced_close" | "security_closed" | "access_changed" | "completed_elsewhere">();

const freeze = <T>(value: T): DeepReadonly<T> => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value as DeepReadonly<T>;
};

const appearanceFor = (meeting: DeepReadonly<Meeting>, appearanceId: string) =>
  meeting.agenda?.find((appearance) => appearance.id === appearanceId);

const editablePhases: readonly MeetingWorkspacePhase[] = [
  "opening",
  "ready",
  "syncing",
  "temporarily_offline",
];

const retainCompletedCollaborativeText = (
  current: DeepReadonly<Meeting>,
  completed: Meeting,
): Meeting => ({
  ...(current as Meeting),
  ...completed,
  generalNotes: current.generalNotes,
  openingInput: current.openingInput,
  agenda: current.agenda as Meeting["agenda"],
});

const compatibleAppearance = (
  meeting: DeepReadonly<Meeting>,
  target: Extract<MeetingTextTarget, { appearanceId: string }>,
): DeepReadonly<MeetingTopic> => {
  const appearance = appearanceFor(meeting, target.appearanceId);
  const person = appearance?.topic?.type === "person";
  const compatible = target.kind === "meeting_topic_note" ? person : !person;
  if (!appearance || appearance.meetingId !== meeting.id || !compatible) {
    throw new Error("MEETING_TEXT_TARGET_INVALID");
  }
  return appearance;
};

export const createMeetingWorkspace = (
  meetingId: string,
  backend: MeetingWorkspaceBackend,
): MeetingWorkspace => {
  let collaboration: MeetingWorkspaceCollaboration | null = null;
  let unsubscribeCollaboration: (() => void) | null = null;
  let syncActivity = 0;
  let generation = 0;
  let controller = new AbortController();
  let localWrites = 0;
  let closing = false;
  let completing = false;
  let refreshQueue = Promise.resolve();
  const pending = () => localWrites > 0 || Boolean(collaboration?.pending);
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!pending()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  let state: MeetingWorkspaceState = freeze({
    phase: "opening" as const,
    meeting: null,
    pendingChanges: false,
    syncActivity,
    collaborators: [],
  });
  const listeners = new Set<(next: MeetingWorkspaceState) => void>();
  const publish = (next: MeetingWorkspaceState) => {
    state = freeze({ ...next, closing });
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", beforeUnload);
      if (state.pendingChanges) window.addEventListener("beforeunload", beforeUnload);
    }
    for (const listener of listeners) listener(state);
  };

  const dispose = () => {
    controller.abort();
    unsubscribeCollaboration?.();
    unsubscribeCollaboration = null;
    const previous = collaboration;
    collaboration = null;
    void previous?.close();
    backend.dispose?.(meetingId);
  };
  const fail = (error: unknown) => {
    const category = classifyMeetingFailure(error);
    if (category === "access") {
      workspace.forceClose("access");
    } else if (category === "recoverable") {
      publish({ ...state, phase: state.meeting ? "temporarily_offline" : "unavailable", pendingChanges: pending() });
    } else {
      generation += 1;
      localWrites = 0;
      dispose();
      publish({ ...state, phase: "unavailable", meeting: null, pendingChanges: false, collaborators: [], notice: "integrity_failure" });
    }
  };
  const load = async () => {
    const currentGeneration = generation;
    const loaded = await backend.load(meetingId, controller.signal);
    if (currentGeneration !== generation || state.phase === "closed") return;
    const completed = loaded.meeting.status === "completed";
    if (loaded.meeting.id !== meetingId) throw new Error("MEETING_WORKSPACE_UNAVAILABLE");
    if (completed && collaboration) {
      if (completing) return;
      workspace.forceClose("completed");
      return;
    }
    if (loaded.unlocked && loaded.collaborative !== false
      && !completed && backend.connect && !collaboration) {
      const connected = await backend.connect(meetingId);
      if (currentGeneration !== generation) {
        void connected.close();
        return;
      }
      collaboration = connected;
      unsubscribeCollaboration = collaboration.subscribe?.((change) => {
        if (!collaboration || currentGeneration !== generation) return;
        if (collaboration.failure === "completed") {
          if (!completing) workspace.forceClose("completed");
          return;
        }
        if (collaboration.failure === "access") {
          workspace.forceClose("access");
          return;
        }
        if (collaboration.failure === "integrity") {
          fail(new Error("MEETING_WORKSPACE_INTEGRITY"));
          return;
        }
        if (change !== "presence") syncActivity += 1;
        publish({ ...state, phase: completing ? "syncing" : collaboration.phase, pendingChanges: pending(), syncActivity, collaborators: collaboration.collaborators });
        if (change === "document") {
          if (backend.readText && state.meeting) {
            try {
              publish({ ...state, meeting: backend.readText(state.meeting as Meeting) });
            } catch (error) { fail(error); }
          } else void workspace.refresh().catch(() => undefined);
        }
      }) ?? null;
      if (collaboration.failure) {
        if (collaboration.failure === "access") workspace.forceClose("access");
        else if (collaboration.failure === "completed") workspace.forceClose("completed");
        else fail(new Error("MEETING_WORKSPACE_INTEGRITY"));
        return;
      }
    }
    publish({
      ...state,
      phase: completing ? "syncing" : loaded.unlocked ? (collaboration?.phase ?? "ready") : "locked",
      meeting: loaded.meeting,
      pendingChanges: pending(),
      syncActivity,
      collaborators: collaboration?.collaborators ?? [],
    });
  };

  const workspace: MeetingWorkspace = {
    meetingId,
    get state() {
      return state;
    },
    async open() {
      const openingGeneration = generation;
      while (liveWorkspace && liveWorkspace !== workspace) {
        if (!await liveWorkspace.close({ reason: "replacement" })) {
          throw new Error("MEETING_WORKSPACE_PENDING_CHANGES");
        }
      }
      if (openingGeneration !== generation) return;
      liveWorkspace = workspace;
      generation += 1;
      const currentGeneration = generation;
      controller = new AbortController();
      closing = false;
      syncActivity = 0;
      publish({
        notice: notices.get(meetingId),
        phase: "opening",
        meeting: null,
        pendingChanges: false,
        syncActivity,
        collaborators: [],
      });
      try {
        await load();
      } catch (error) {
        if (currentGeneration === generation) fail(error);
        throw error;
      }
    },
    refresh() {
      const currentGeneration = generation;
      const refreshed = refreshQueue.then(async () => {
        if (state.phase === "closed" || currentGeneration !== generation) return;
        try {
          await load();
        } catch (error) {
          if (currentGeneration === generation) fail(error);
          throw error;
        }
      });
      refreshQueue = refreshed.catch(() => undefined);
      return refreshed;
    },
    text(target) {
      const current = state.meeting;
      if (!current) throw new Error("MEETING_WORKSPACE_UNAVAILABLE");
      if ("appearanceId" in target) compatibleAppearance(current, target);
      return freeze({
        target,
        get value() {
          const meeting = state.meeting;
          if (!meeting) return "";
          if (target.kind === "general_notes") return meeting.generalNotes ?? "";
          if (target.kind === "opening_input") return meeting.openingInput ?? "";
          const appearance = appearanceFor(meeting, target.appearanceId);
          if (!appearance) return "";
          if (target.kind === "meeting_topic_note") return appearance.personNote?.text ?? "";
          if (target.kind === "preparation_context") return appearance.preparationContext?.text ?? "";
          return appearance.meetingMinutes?.text ?? "";
        },
        get editable() {
          return !closing && !completing && !collaboration?.editingPaused && editablePhases.includes(state.phase)
            && state.meeting?.status !== "completed" && Boolean(state.meeting)
            && (!("appearanceId" in target) || Boolean(appearanceFor(state.meeting!, target.appearanceId)));
        },
      });
    },
    async updateText(target, value) {
      const binding = workspace.text(target);
      if (!binding.editable || !backend.updateText) {
        throw new Error("MEETING_TEXT_READ_ONLY");
      }
      const currentGeneration = generation;
      localWrites += 1;
      publish({ ...state, pendingChanges: true });
      try {
        await backend.updateText(meetingId, target, value);
        if (currentGeneration === generation) await workspace.refresh();
      } finally {
        if (currentGeneration === generation) {
          localWrites -= 1;
          publish({ ...state, pendingChanges: pending() });
        }
      }
    },
    async complete() {
      if (completing) return;
      const currentGeneration = generation;
      const current = state.meeting;
      if (!current) throw new Error("MEETING_WORKSPACE_UNAVAILABLE");
      const previousPhase = state.phase;
      let committed = false;
      completing = true;
      publish({ ...state, phase: "syncing" });
      try {
        const completed = await backend.complete(meetingId);
        if (currentGeneration !== generation) return;
        committed = true;
        publish({ ...state, meeting: retainCompletedCollaborativeText(state.meeting ?? current, completed) });
        unsubscribeCollaboration?.();
        unsubscribeCollaboration = null;
        await collaboration?.close();
        collaboration = null;
        // Reload the authoritative snapshots and all collaborators' settled text.
        const loaded = await backend.load(meetingId, controller.signal);
        if (currentGeneration !== generation) return;
        if (loaded.meeting.status !== "completed") throw new Error("MEETING_WORKSPACE_UNAVAILABLE");
        publish({
          phase: loaded.unlocked ? "ready" : "locked",
          meeting: loaded.meeting,
          pendingChanges: false,
          syncActivity,
          collaborators: [],
        });
      } catch (error) {
        if (currentGeneration === generation) {
          if (collaboration?.failure === "completed") workspace.forceClose("completed");
          else if (committed) fail(error);
          else publish({ ...state, phase: collaboration?.phase ?? previousPhase, pendingChanges: pending() });
        }
        throw error;
      } finally {
        completing = false;
        if (currentGeneration === generation) publish({ ...state });
      }
    },
    async close(options = {}) {
      if (state.phase === "closed") return true;
      closing = true;
      publish({ ...state, pendingChanges: pending() });
      const deadline = Date.now() + 1_500;
      while (!options.discard && pending() && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (workspace.state.phase === "closed") return true;
      if (!options.discard && pending()) return false;
      generation += 1;
      localWrites = 0;
      dispose();
      if (liveWorkspace === workspace) liveWorkspace = null;
      publish({ phase: "closed", meeting: null, pendingChanges: false, syncActivity, collaborators: [] });
      return true;
    },
    cancelClose() {
      if (state.phase === "closed") return;
      closing = false;
      publish({ ...state });
    },
    dismissNotice() {
      notices.delete(meetingId);
      publish({ ...state, notice: undefined });
    },
    forceClose(reason) {
      if (state.phase === "closed") return;
      const notice = reason === "unmount" && !pending()
        ? state.notice
        : reason === "completed"
          ? "completed_elsewhere"
          : reason === "access"
          ? "access_changed"
          : pending() ? "forced_close" : "security_closed";
      if (notice && notice !== "integrity_failure") notices.set(meetingId, notice);
      generation += 1;
      closing = true;
      localWrites = 0;
      dispose();
      if (liveWorkspace === workspace) liveWorkspace = null;
      publish({ phase: "closed", meeting: null, pendingChanges: false, syncActivity, collaborators: [], notice });
      if (reason === "access" || reason === "completed") backend.revokeAccess?.();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return workspace;
};
