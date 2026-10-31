<script setup lang="ts">
import DOMPurify from "dompurify";
import { useI18n } from "vue-i18n";
import { sanitizeRichText } from "./sanitize-rich-text";

defineProps<{
  openingInput?: string | null;
  generalNotes?: string | null;
}>();
const { t } = useI18n();
const safe = sanitizeRichText;
const hasRichText = (html: string | null | undefined) =>
  DOMPurify.sanitize(html ?? "", { ALLOWED_TAGS: [] })
    .replace(/&nbsp;|&#160;/gi, " ")
    .trim().length > 0;
</script>

<template>
  <section
    v-if="
      hasRichText(openingInput) || hasRichText(generalNotes)
    "
    :aria-label="t('meetingAgenda.notes')"
    class="meeting-notes"
  >
    <div v-if="hasRichText(openingInput)" class="meeting-note">
      <p class="meeting-note-label">
        <i class="pi pi-play-circle" />
        {{ t("meetingAgenda.opening") }}
      </p>
      <div
        class="meeting-note-content"
        v-html="safe(openingInput)"
      />
    </div>
    <div v-if="hasRichText(generalNotes)" class="meeting-note">
      <p class="meeting-note-label">
        <i class="pi pi-file-edit" />
        {{ t("meetingAgenda.generalNotes") }}
      </p>
      <div
        class="meeting-note-content"
        v-html="safe(generalNotes)"
      />
    </div>
  </section>
</template>

<style scoped>
.meeting-notes {
  display: grid;
  gap: 0.8rem;
  margin-top: 1rem;
}

.meeting-note {
  padding: 1rem 1.2rem;
  border-left: 3px solid #7996c8;
  background: #eef3fa;
}

.meeting-note-label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0 0 0.55rem;
  color: #536f9f;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.meeting-note-content {
  color: #344258;
  line-height: 1.55;
}

.meeting-note-content :deep(p) {
  margin: 0.35rem 0;
}
</style>
