<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useSlots } from "vue";
import Textarea from "primevue/textarea";
import type { MeetingTopic } from "../../../api/domain";
import { useI18n } from "vue-i18n";
import { useMeetingTopicNoteAutosave } from "../../useMeetingTopicNoteAutosave";

const props = defineProps<{
  item: MeetingTopic;
  readOnly: boolean;
  label?: string;
  save: (note: string | null) => Promise<MeetingTopic>;
}>();

const { t } = useI18n();
const slots = useSlots();
const inlineLabel = ref<HTMLElement>();
const inlineLabelIndent = ref("0px");
let labelObserver: ResizeObserver | undefined;

const { localNote, state, error, saving, save, scheduleSave } =
  useMeetingTopicNoteAutosave({
    source: () => props.item.agendaNote,
    save: (note) => props.save(note),
    saveFailedMessage: () => t("personTopic.noteSaveFailed"),
  });

const measureInlineLabel = () => {
  const width = inlineLabel.value?.getBoundingClientRect().width ?? 0;
  inlineLabelIndent.value = `${Math.ceil(width) + 6}px`;
};

onMounted(async () => {
  if (!slots.label) return;
  await nextTick();
  measureInlineLabel();
  if (typeof ResizeObserver !== "undefined" && inlineLabel.value) {
    labelObserver = new ResizeObserver(measureInlineLabel);
    labelObserver.observe(inlineLabel.value);
  }
});

onBeforeUnmount(() => {
  labelObserver?.disconnect();
});
</script>

<template>
  <span v-if="readOnly" class="read-only-note">
    <span v-if="$slots.label" class="read-only-label">
      <slot name="label" />
    </span>
    {{ localNote || t("personTopic.noNote") }}
  </span>
  <span v-else class="note-editor" :aria-busy="saving">
    <span class="note-input">
      <span v-if="$slots.label" ref="inlineLabel" class="inline-label">
        <slot name="label" />
      </span>
      <Textarea
        v-model="localNote"
        auto-resize
        rows="1"
        :aria-label="label ?? t('personTopic.noteLabel')"
        :style="{ '--inline-label-indent': inlineLabelIndent }"
        @input="scheduleSave"
        @blur="save"
      />
    </span>
    <span class="save-feedback" role="status" aria-live="polite">
      <template v-if="state === 'saving'">{{ t("personTopic.saving") }}</template>
      <template v-else-if="state === 'saved'">{{ t("personTopic.saved") }}</template>
      <template v-else-if="state === 'error'">
        {{ error }}
        <button type="button" @click="save">{{ t("personTopic.retry") }}</button>
      </template>
    </span>
  </span>
</template>

<style scoped>
.note-editor {
  display: grid;
  min-width: 0;
  width: 100%;
}

.note-input {
  position: relative;
  min-width: 0;
}

.inline-label {
  position: absolute;
  z-index: 1;
  top: 0.5rem;
  left: 0.75rem;
  font-weight: 800;
  pointer-events: auto;
}

textarea {
  width: 100%;
  min-height: 2.2rem;
  resize: none;
  text-indent: var(--inline-label-indent);
}

.save-feedback {
  min-height: 1rem;
  color: #68758a;
  font-size: 0.72rem;
}

.save-feedback button {
  border: 0;
  padding: 0 0.2rem;
  color: #315c9b;
  background: transparent;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.read-only-note {
  white-space: pre-wrap;
}

.read-only-label {
  float: left;
  margin-right: 0.35rem;
  font-weight: 800;
}

</style>
