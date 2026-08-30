import { onBeforeUnmount, ref, type Ref, watch } from "vue";
type SaveState = "idle" | "saving" | "saved" | "error";
const PROTECTED_TEXT_LOCKED = "E2EE_PROTECTED_TEXT_LOCKED";

const isExpectedLockedState = (cause: unknown): boolean =>
  cause instanceof Error && cause.message === PROTECTED_TEXT_LOCKED;

export const useMeetingTopicNoteAutosave = (options: {
  source: () => string | null | undefined;
  save: (note: string | null) => Promise<unknown>;
  saveFailedMessage: () => string;
  normalize?: (note: string) => string | null;
}): {
  localNote: Ref<string>;
  state: Ref<SaveState>;
  error: Ref<string>;
  saving: Ref<boolean>;
  save: () => void;
  scheduleSave: () => void;
  markSaving: () => void;
  markSaved: () => void;
} => {
  const initialNote = options.source() ?? "";
  const localNote = ref(initialNote);
  const persistedNote = ref(initialNote);
  const state = ref<SaveState>("idle");
  const error = ref("");
  const saving = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  let queuedNote: string | null | undefined;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const clearSavedTimer = () => {
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = undefined;
  };
  const markSaving = () => {
    clearSavedTimer();
    state.value = "saving";
  };
  const markSaved = () => {
    clearSavedTimer();
    state.value = "saved";
    savedTimer = setTimeout(() => {
      state.value = "idle";
      savedTimer = undefined;
    }, 2_000);
  };

  const drain = async () => {
    if (saving.value) return;
    while (queuedNote !== undefined) {
      const note = queuedNote;
      queuedNote = undefined;
      if ((note ?? "") === persistedNote.value) continue;
      saving.value = true;
      markSaving();
      error.value = "";
      try {
        await options.save(note);
        persistedNote.value = note ?? "";
        markSaved();
      } catch (cause) {
        if (isExpectedLockedState(cause)) {
          state.value = "idle";
          queuedNote = undefined;
          break;
        }
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
    clearSavedTimer();
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

  onBeforeUnmount(() => {
    clearTimer();
    clearSavedTimer();
  });

  return {
    localNote,
    state,
    error,
    saving,
    save,
    scheduleSave,
    markSaving,
    markSaved,
  };
};
