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
  readonly meeting: DeepReadonly<Meeting> | null;
  readonly pendingChanges: boolean;
  readonly syncActivity: number;
  readonly collaborators: readonly MeetingWorkspaceCollaborator[];
}

export interface MeetingWorkspaceCollaboration {
  readonly phase: "ready" | "temporarily_offline" | "syncing" | "unavailable";
  readonly pending: boolean;
  readonly collaborators: readonly MeetingWorkspaceCollaborator[];
  subscribe?(listener: (change?: "state" | "document" | "presence") => void): () => void;
  close(): void | Promise<void>;
  complete(): Promise<void>;
}

export interface MeetingWorkspaceBackend {
  load(meetingId: string): Promise<{ meeting: Meeting; unlocked: boolean; collaborative?: boolean }>;
  connect?(meetingId: string): Promise<MeetingWorkspaceCollaboration>;
  complete(meetingId: string): Promise<Meeting>;
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
  close(options?: { reason?: "navigation" | "lock" | "replacement" }): Promise<void>;
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
  let state: MeetingWorkspaceState = freeze({
    phase: "opening" as const,
    meeting: null,
    pendingChanges: false,
    syncActivity,
    collaborators: [],
  });
  const listeners = new Set<(next: MeetingWorkspaceState) => void>();
  const publish = (next: MeetingWorkspaceState) => {
    state = freeze(next);
    for (const listener of listeners) listener(state);
  };

  const load = async () => {
    const loaded = await backend.load(meetingId);
    const completed = loaded.meeting.status === "completed";
    if (loaded.meeting.id !== meetingId) throw new Error("MEETING_WORKSPACE_UNAVAILABLE");
    if (loaded.unlocked && loaded.collaborative !== false
      && !completed && backend.connect && !collaboration) {
      collaboration = await backend.connect(meetingId);
      unsubscribeCollaboration = collaboration.subscribe?.((change) => {
        if (change !== "presence") syncActivity += 1;
        if (change === "document") {
          publish({ ...state, syncActivity });
          void load().catch(() => {
            publish({
              phase: "unavailable",
              meeting: null,
              pendingChanges: false,
              syncActivity,
              collaborators: [],
            });
          });
          return;
        }
        if (!state.meeting || !collaboration) return;
        publish({
          phase: collaboration.phase,
          meeting: state.meeting as Meeting,
          pendingChanges: collaboration.pending,
          syncActivity,
          collaborators: collaboration.collaborators,
        });
      }) ?? null;
    }
    publish({
      phase: loaded.unlocked ? (collaboration?.phase ?? "ready") : "locked",
      meeting: loaded.meeting,
      pendingChanges: collaboration?.pending ?? false,
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
      if (liveWorkspace && liveWorkspace !== workspace) {
        await liveWorkspace.close({ reason: "replacement" });
      }
      liveWorkspace = workspace;
      syncActivity = 0;
      publish({
        phase: "opening",
        meeting: null,
        pendingChanges: false,
        syncActivity,
        collaborators: [],
      });
      try {
        await load();
      } catch (error) {
        publish({
          phase: "unavailable",
          meeting: null,
          pendingChanges: false,
          syncActivity,
          collaborators: [],
        });
        throw error;
      }
    },
    async refresh() {
      if (state.phase === "closed") return;
      await load();
    },
    text(target) {
      const current = state.meeting;
      if (!current) throw new Error("MEETING_WORKSPACE_UNAVAILABLE");
      let value: string | null | undefined;
      if (target.kind === "general_notes") value = current.generalNotes;
      else if (target.kind === "opening_input") value = current.openingInput;
      else {
        const appearance = compatibleAppearance(current, target);
        if (target.kind === "meeting_topic_note") value = appearance.personNote?.text;
        else if (target.kind === "preparation_context") value = appearance.preparationContext?.text;
        else value = appearance.meetingMinutes?.text;
      }
      return freeze({
        target,
        value: value ?? "",
        editable: editablePhases.includes(state.phase) && current.status !== "completed",
      });
    },
    async updateText(target, value) {
      const binding = workspace.text(target);
      if (!binding.editable || !backend.updateText) {
        throw new Error("MEETING_TEXT_READ_ONLY");
      }
      await backend.updateText(meetingId, target, value);
      await workspace.refresh();
    },
    async complete() {
      if (collaboration) await collaboration.complete();
      const current = state.meeting;
      if (!current) throw new Error("MEETING_WORKSPACE_UNAVAILABLE");
      const completed = await backend.complete(meetingId);
      await collaboration?.close();
      unsubscribeCollaboration?.();
      unsubscribeCollaboration = null;
      collaboration = null;
      publish({
        phase: "ready",
        meeting: retainCompletedCollaborativeText(current, completed),
        pendingChanges: false,
        syncActivity,
        collaborators: [],
      });
    },
    async close() {
      await collaboration?.close();
      unsubscribeCollaboration?.();
      unsubscribeCollaboration = null;
      collaboration = null;
      if (liveWorkspace === workspace) liveWorkspace = null;
      publish({
        phase: "closed",
        meeting: null,
        pendingChanges: false,
        syncActivity,
        collaborators: [],
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return workspace;
};
