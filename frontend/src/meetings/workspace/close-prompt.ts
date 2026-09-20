import { shallowRef, type InjectionKey } from "vue";
import type { MeetingWorkspace } from "./core";

export const createClosePrompt = (workspace: MeetingWorkspace) => {
  const visible = shallowRef(false);
  let decide: ((discard: boolean) => void) | null = null;
  let active: Promise<boolean> | null = null;
  const answer = (discard: boolean) => {
    visible.value = false;
    decide?.(discard);
    decide = null;
  };
  return {
    visible,
    answer,
    close(reason: "navigation" | "lock" | "replacement"): Promise<boolean> {
      if (active) return active;
      active = (async () => {
        if (await workspace.close({ reason })) return true;
        visible.value = true;
        const discard = await new Promise<boolean>((resolve) => { decide = resolve; });
        if (workspace.state.phase === "closed") return true;
        if (discard) return workspace.close({ reason, discard: true });
        workspace.cancelClose();
        return false;
      })().finally(() => { active = null; });
      return active;
    },
  };
};
export const closePromptKey: InjectionKey<ReturnType<typeof createClosePrompt>> = Symbol("meeting-close-prompt");
