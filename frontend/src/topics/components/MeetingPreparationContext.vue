<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { MeetingTopic } from "../../api/domain";
import { formatUser, isAppearancePostponed } from "../../api/domain";
import { formatDate } from "../../i18n";
import { hasMeaningfulRichText, sanitizeRichText } from "../../components/sanitize-rich-text";

defineOptions({ name: "MeetingPreparationContext" });
const props = defineProps<{ item: MeetingTopic }>();
const { t } = useI18n();
const safe = sanitizeRichText;
const previous = computed(() => props.item.previousAppearance);
const latest = computed(() => props.item.preparationHistory?.[0]);
const showLatestPostponement = computed(() => isAppearancePostponed(latest.value)
  && latest.value?.appearanceId !== previous.value?.appearanceId);
const latestDate = computed(() => latest.value
  ? `${latest.value.date}T${latest.value.beginTime}`
  : null);
const updates = computed(() => props.item.preparationUpdates ?? props.item.topic?.updates ?? []);
const eligible = computed(() => props.item.topic?.type !== "person");
const hasPreviousContent = computed(() =>
  hasMeaningfulRichText(previous.value?.preparationContext?.text)
  || hasMeaningfulRichText(previous.value?.meetingMinutes?.text),
);
const previousDate = computed(() => previous.value?.date
  ? `${previous.value.date}T${previous.value.beginTime ?? "00:00"}`
  : null);
</script>

<template>
  <div
    v-if="eligible && (hasPreviousContent || showLatestPostponement || updates.length || item.preparationHistoryUnavailable)"
    class="meeting-preparation-context"
  >
    <section v-if="hasPreviousContent || showLatestPostponement" class="context-group">
      <div class="context-heading">
        <h4>{{ t("meetingPreparation.previousMeeting") }}</h4>
        <span v-if="isAppearancePostponed(previous)" class="postponed-badge">
          {{ t("meetingPreparation.postponed") }}
        </span>
        <small v-if="previousDate">
          {{ formatDate(previousDate, { dateStyle: "short", timeStyle: "short" }) }}
        </small>
      </div>
      <small v-if="showLatestPostponement" class="latest-postponement">
        {{ t("meetingPreparation.latestPostponed") }}
        <template v-if="latestDate">
          · {{ formatDate(latestDate, { dateStyle: "short", timeStyle: "short" }) }}
        </template>
      </small>
      <div
        v-if="hasMeaningfulRichText(previous?.preparationContext?.text)"
        class="context-entry previous-preparation"
        v-html="safe(previous?.preparationContext?.text)"
      />
      <div
        v-if="hasMeaningfulRichText(previous?.meetingMinutes?.text)"
        class="context-entry previous-minutes"
        v-html="safe(previous?.meetingMinutes?.text)"
      />
    </section>
    <p v-if="item.preparationHistoryUnavailable" class="context-entry">
      {{ t("meetingPreparation.historyUnavailable") }}
    </p>
    <section v-if="updates.length" class="context-group">
      <h4>{{ t("meetingPreparation.standaloneUpdates") }}</h4>
      <article v-for="update in updates" :key="update.id" class="context-entry update">
        <div v-html="safe(update.text)" />
        <small>
          {{ formatDate(update.date, { dateStyle: "short", timeStyle: "short" }) }}
          <template v-if="update.createdBy">
            · {{ formatUser(update.createdBy) }}
          </template>
        </small>
      </article>
    </section>
  </div>
</template>

<style scoped>
.meeting-preparation-context {
  display: grid;
  gap: 0.65rem;
  margin: 0.8rem 0;
}

.context-group {
  display: grid;
  gap: 0.4rem;
}

.context-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2rem 0.5rem;
}

h4 {
  margin: 0;
  color: #607dae;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.postponed-badge {
  padding: 0.1rem 0.4rem;
  border-radius: 0.3rem;
  background: #fff3cd;
  color: #785800;
  font-size: 0.75rem;
  font-weight: 600;
}

.context-entry {
  overflow-wrap: anywhere;
  padding: 0.65rem 0.8rem;
  border-radius: 0.5rem;
  background: #f5f7fa;
  line-height: 1.5;
}

.previous-preparation {
  color: #6c7b8f;
}

.previous-minutes {
  color: #17243a;
}

.context-entry :deep(p) {
  margin: 0.2rem 0;
}

small {
  color: #718096;
  font-size: 0.75rem;
}
</style>
