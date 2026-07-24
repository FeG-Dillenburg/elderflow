<script setup lang="ts">
import DOMPurify from "dompurify";
import { computed, watch } from "vue";
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
const safe = (html: string | null | undefined) => DOMPurify.sanitize(
  html ?? "",
  { FORBID_ATTR: ["style"] },
);
const plainText = (html: string | null | undefined): string =>
  DOMPurify.sanitize(html ?? "", { ALLOWED_TAGS: [] })
    .replace(/&nbsp;|&#160;|\u00a0/gi, " ")
    .trim();
const normalize = (html: string): string | null => {
  return plainText(html) ? html : null;
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
const previousPreparation = computed(() =>
  props.item.previousMeetingTexts?.preparationContext ?? null);
const previousMinutes = computed(() =>
  props.item.previousMeetingTexts?.meetingMinutes ?? null);
const hasPreviousPreparation = computed(() =>
  Boolean(plainText(previousPreparation.value)));
const hasPreviousMinutes = computed(() =>
  Boolean(plainText(previousMinutes.value)));
const hasPreviousMeetingTexts = computed(() =>
  hasPreviousPreparation.value || hasPreviousMinutes.value);
const hasPreparation = computed(() => Boolean(plainText(preparation.localNote.value)));
</script>

<template>
  <div class="paired-meeting-texts">
    <section
      v-if="mode === 'preparation' && hasPreviousMeetingTexts"
      class="previous-meeting-entries"
      :aria-label="t('meetingTexts.previousMeetingEntries')"
    >
      <h4>{{ t("meetingTexts.previousMeetingEntries") }}</h4>
      <div
        v-if="hasPreviousPreparation"
        class="previous-entry previous-preparation"
        v-html="safe(previousPreparation)"
      />
      <div
        v-if="hasPreviousMinutes"
        class="previous-entry previous-minutes"
        v-html="safe(previousMinutes)"
      />
    </section>

    <section
      v-if="mode === 'preparation' || hasPreparation"
      class="meeting-text preparation-context"
      :aria-label="t('meetingTexts.preparationContext')"
      :aria-busy="mode === 'preparation' && preparation.saving.value"
    >
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
    </section>

    <section
      v-if="mode !== 'preparation'"
      class="meeting-text minutes-field"
      :aria-label="t('meetingTexts.meetingMinutes')"
      :aria-busy="mode === 'active' && canWriteMinutes && minutes.saving.value"
    >
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
  gap: 0.65rem;
  margin-top: 0.8rem;
}

.meeting-text {
  min-width: 0;
}

.previous-meeting-entries {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
}

.previous-meeting-entries h4 {
  margin: 0 0 0.1rem;
  color: #607dae;
  font-size: 0.75rem;
  font-weight: 800;
}

.previous-entry {
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.previous-preparation {
  color: #6c7b8f;
}

.previous-minutes {
  color: #17243a;
}

.read-only-text {
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.preparation-context .read-only-text {
  color: #6c7b8f;
}

.minutes-field .read-only-text {
  color: #17243a;
}

.read-only-text :deep(p),
.previous-entry :deep(p),
.empty-text {
  margin: 0.25rem 0;
}

.empty-text {
  color: #6c7b8f;
  font-size: 0.75rem;
}
</style>
