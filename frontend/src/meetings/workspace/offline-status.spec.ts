import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { Meeting } from "../../api/domain";
import { EncryptedMeetingCollaborationProvider, meetingCollaboration } from "../../e2ee/meeting-collaboration";
import { meetingDocumentSession } from "../../e2ee/meeting-document-session";
import { createMeetingWorkspace } from "./core";
import { productionMeetingWorkspaceBackend } from "./production-adapter";
import { meetingRouteFactoryKey, useMeetingRoute } from "./vue";
import MeetingWorkspaceStatus from "./MeetingWorkspaceStatus.vue";

class Socket extends EventTarget {
  readyState: number = WebSocket.OPEN;
  send() {}
  close() {
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.querySelector("#meeting-workspace-status")?.remove();
});

it.each(["reconnecting", "encrypting", "browser-disconnect"])("keeps the offline warning and suppresses sync animation while %s", async (activity) => {
  vi.useFakeTimers();
  const target = document.createElement("div");
  target.id = "meeting-workspace-status";
  document.body.append(target);
  const documentModel = new Y.Doc();
  const socket = new Socket();
  let activeSocket = socket;
  let resume!: (ticket: { ticket: string; documentId: string; websocketPath: string }) => void;
  const ticket = vi.fn()
    .mockResolvedValueOnce({ ticket: "ticket", documentId: "document", websocketPath: "/socket" })
    .mockImplementation(() => new Promise((resolve) => { resume = resolve; }));
  const provider = new EncryptedMeetingCollaborationProvider(
    "offline-status", documentModel, ticket, () => activeSocket as unknown as WebSocket,
  );
  vi.spyOn(meetingCollaboration, "get").mockReturnValue(provider);
  provider.awareness.setLocalState(null);
  await provider.connect();
  socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "authenticated" }) }));
  await flushPromises();
  const workspace = createMeetingWorkspace("offline-status", {
    load: async () => ({ meeting: { id: "offline-status", status: "planned" } as Meeting, unlocked: true }),
    connect: productionMeetingWorkspaceBackend.connect,
    complete: vi.fn(),
  });
  const opened = workspace.open();
  const Harness = defineComponent({
    setup() {
      useMeetingRoute("offline-status");
      return () => h(MeetingWorkspaceStatus);
    },
  });
  const wrapper = mount(Harness, { global: {
    stubs: { Dialog: true, Button: true, Message: true },
    provide: { [meetingRouteFactoryKey as symbol]: () => ({ workspace, opened, operations: {} }) },
  } });
  try {
    await opened;
    expect(workspace.state.phase).toBe("ready");
    if (activity === "browser-disconnect") window.dispatchEvent(new Event("offline"));
    else socket.close();
    await flushPromises();
    expect(Boolean(target.querySelector(".phase-temporarily_offline"))).toBe(true);
    if (activity === "reconnecting") {
      await vi.advanceTimersByTimeAsync(1_000);
    } else if (activity === "encrypting") {
      vi.spyOn(meetingDocumentSession, "createPendingDocumentUpdate")
        .mockImplementation(() => new Promise(() => undefined));
      documentModel.getText("notes").insert(0, "Offline edit");
    }
    await flushPromises();
    expect(workspace.state.phase).toBe("temporarily_offline");
    expect(Boolean(target.querySelector(".phase-temporarily_offline"))).toBe(true);
    expect(Boolean(target.querySelector(".workspace-sync-activity.is-visible"))).toBe(false);
    expect(target.textContent).toContain("Offline — edits will reconnect securely");
    if (activity === "reconnecting") {
      activeSocket = new Socket();
      resume({ ticket: "new-ticket", documentId: "document", websocketPath: "/socket" });
      await flushPromises();
      expect(workspace.state.phase).toBe("temporarily_offline");
      activeSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "authenticated" }) }));
      await flushPromises();
      expect(workspace.state.phase).toBe("ready");
      expect(target.textContent).toContain("Live collaboration connected");

    } else if (activity === "encrypting") expect(workspace.state.pendingChanges).toBe(true);
  } finally {
    wrapper.unmount();
    provider.destroy();
    documentModel.destroy();
  }
});
