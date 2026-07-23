<script setup lang="ts">
import DOMPurify from "dompurify";
import { watch } from "vue";
import { useI18n } from "vue-i18n";
import type { MeetingTopic } from "../../../api/domain";
import RichTextEditor from "../../../components/RichTextEditor.vue";
import { useMeetingTopicNoteAutosave } from "../../useMeetingTopicNoteAutosave";

const props = defineProps<{
  item: MeetingTopic;
  readOnly: boolean;
  save: (note: string | null) => Promise<MeetingTopic>;
}>();

const { t } = useI18n();
const safeNote = (html: string) => DOMPurify.sanitize(html);
const normalizeNote = (html: string): string | null => {
  const text = DOMPurify.sanitize(html, { ALLOWED_TAGS: [] })
    .replace(/&nbsp;|&#160;|\u00a0/gi, " ")
    .trim();
  return text ? html : null;
};

const { localNote, state, error, saving, save, scheduleSave } =
  useMeetingTopicNoteAutosave({
    source: () => props.item.agendaNote,
    save: (note) => props.save(note),
    saveFailedMessage: () => t("personTopic.noteSaveFailed"),
    normalize: normalizeNote,
  });

watch(localNote, scheduleSave);
</script>

<template>
  <div v-if="readOnly" class="read-only-note">
    <div v-if="localNote" v-html="safeNote(localNote)" />
    <span v-else>{{ t("personTopic.noNote") }}</span>
  </div>
  <div v-else class="note-editor" :aria-busy="saving">
    <RichTextEditor
      v-model="localNote"
      :placeholder="t('personTopic.noteLabel')"
      height="100px"
    />
    <span class="save-feedback" role="status" aria-live="polite">
      <template v-if="state === 'saving'">{{ t("personTopic.saving") }}</template>
      <template v-else-if="state === 'saved'">{{ t("personTopic.saved") }}</template>
      <template v-else-if="state === 'error'">
        {{ error }}
        <button type="button" @click="save">{{ t("personTopic.retry") }}</button>
      </template>
    </span>
  </div>
</template>

<style scoped>
.note-editor {
  display: grid;
  min-width: 0;
  width: 100%;
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
  min-width: 0;
}
</style>
