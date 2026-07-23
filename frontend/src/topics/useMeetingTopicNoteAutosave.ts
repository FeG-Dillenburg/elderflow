import { onBeforeUnmount, ref, type Ref, watch } from "vue";
import type { MeetingTopic } from "../api/domain";

type SaveState = "idle" | "saving" | "saved" | "error";

export const useMeetingTopicNoteAutosave = (options: {
  source: () => string | null | undefined;
  save: (note: string | null) => Promise<MeetingTopic>;
  saveFailedMessage: () => string;
  normalize?: (note: string) => string | null;
}): {
  localNote: Ref<string>;
  state: Ref<SaveState>;
  error: Ref<string>;
  saving: Ref<boolean>;
  save: () => void;
  scheduleSave: () => void;
} => {
  const initialNote = options.source() ?? "";
  const localNote = ref(initialNote);
  const persistedNote = ref(initialNote);
  const state = ref<SaveState>("idle");
  const error = ref("");
  const saving = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queuedNote: string | null | undefined;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  const drain = async () => {
    if (saving.value) return;
    while (queuedNote !== undefined) {
      const note = queuedNote;
      queuedNote = undefined;
      if ((note ?? "") === persistedNote.value) continue;
      saving.value = true;
      state.value = "saving";
      error.value = "";
      try {
        await options.save(note);
        persistedNote.value = note ?? "";
        state.value = "saved";
      } catch (cause) {
        error.value = cause instanceof Error
          ? cause.message
          : options.saveFailedMessage();
        state.value = "error";
        queuedNote = undefined;
        break;
      } finally {
        saving.value = false;
      }
    }
  };

  const save = () => {
    clearTimer();
    queuedNote = options.normalize
      ? options.normalize(localNote.value)
      : localNote.value.trim()
        ? localNote.value
        : null;
    void drain();
  };

  const scheduleSave = () => {
    if (localNote.value === persistedNote.value) return;
    state.value = "idle";
    clearTimer();
    timer = setTimeout(save, 600);
  };

  watch(options.source, (note) => {
    const next = note ?? "";
    if (localNote.value === persistedNote.value) localNote.value = next;
    persistedNote.value = next;
  });

  onBeforeUnmount(clearTimer);

  return {
    localNote,
    state,
    error,
    saving,
    save,
    scheduleSave,
  };
};
