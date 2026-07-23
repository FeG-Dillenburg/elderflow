<script setup lang="ts">
import DOMPurify from "dompurify";
import { watch } from "vue";
import { useI18n } from "vue-i18n";
import type { MeetingTopic } from "../../api/domain";
import { useMeetingTopicNoteAutosave } from "../useMeetingTopicNoteAutosave";
import MeetingTextEditor from "./MeetingTextEditor.vue";

const props = withDefaults(defineProps<{
  item: MeetingTopic;
  mode: "preparation" | "active" | "completed";
  canWriteMinutes?: boolean;
  savePreparation: (text: string | null) => Promise<unknown>;
  saveMinutes: (text: string | null) => Promise<unknown>;
}>(), {
  canWriteMinutes: false,
});

const { t } = useI18n();
const safe = (html: string | null | undefined) => DOMPurify.sanitize(html ?? "");
const normalize = (html: string): string | null => {
  const text = DOMPurify.sanitize(html, { ALLOWED_TAGS: [] })
    .replace(/&nbsp;|&#160;|\u00a0/gi, " ")
    .trim();
  return text ? html : null;
};

const preparation = useMeetingTopicNoteAutosave({
  source: () => props.item.preparationContext?.text ?? props.item.agendaNote,
  save: props.savePreparation,
  saveFailedMessage: () => t("meetingTexts.preparationSaveFailed"),
  normalize,
});
const minutes = useMeetingTopicNoteAutosave({
  source: () => props.item.meetingMinutes?.text,
  save: props.saveMinutes,
  saveFailedMessage: () => t("meetingTexts.minutesSaveFailed"),
  normalize,
});

watch(preparation.localNote, preparation.scheduleSave);
watch(minutes.localNote, minutes.scheduleSave);
</script>

<template>
  <div class="paired-meeting-texts">
    <section
      class="meeting-text preparation-context"
      :aria-labelledby="`preparation-context-${item.id}`"
      :aria-busy="mode === 'preparation' && preparation.saving.value"
    >
      <h4 :id="`preparation-context-${item.id}`">
        {{ t("meetingTexts.preparationContext") }}
      </h4>
      <template v-if="mode === 'preparation'">
        <MeetingTextEditor
          v-model="preparation.localNote.value"
          :label="t('meetingTexts.preparationContext')"
          :description="t('meetingTexts.preparationDescription')"
          :state="preparation.state.value"
          :error="preparation.error.value"
          @save="preparation.save"
        />
      </template>
      <div
        v-else-if="preparation.localNote.value"
        class="read-only-text"
        v-html="safe(preparation.localNote.value)"
      />
      <p v-else class="empty-text">{{ t("meetingTexts.noPreparationContext") }}</p>
    </section>

    <section
      v-if="mode !== 'preparation'"
      class="meeting-text minutes-field"
      :aria-labelledby="`meeting-minutes-${item.id}`"
      :aria-busy="mode === 'active' && canWriteMinutes && minutes.saving.value"
    >
      <h4 :id="`meeting-minutes-${item.id}`">
        {{ t("meetingTexts.meetingMinutes") }}
      </h4>
      <template v-if="mode === 'active' && canWriteMinutes">
        <MeetingTextEditor
          v-model="minutes.localNote.value"
          :label="t('meetingTexts.meetingMinutes')"
          :description="t('meetingTexts.minutesDescription')"
          :state="minutes.state.value"
          :error="minutes.error.value"
          @save="minutes.save"
        />
      </template>
      <div
        v-else-if="minutes.localNote.value"
        class="read-only-text"
        v-html="safe(minutes.localNote.value)"
      />
      <p v-else class="empty-text">{{ t("meetingTexts.noMeetingMinutes") }}</p>
    </section>
  </div>
</template>

<style scoped>
.paired-meeting-texts {
  display: grid;
  gap: 0.75rem;
  margin-top: 0.8rem;
}

.meeting-text {
  min-width: 0;
  padding: 0.75rem;
  border-left: 3px solid #91a8c8;
  background: #f5f8fc;
}

.minutes-field {
  border-left-color: #5b7faf;
  background: #eef4fb;
}

h4 {
  margin: 0 0 0.45rem;
  color: #526b8e;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.read-only-text {
  overflow-wrap: anywhere;
  color: #344258;
  line-height: 1.5;
}

.read-only-text :deep(p),
.empty-text {
  margin: 0.25rem 0;
}

.empty-text {
  color: #6c7b8f;
  font-size: 0.75rem;
}
</style>
