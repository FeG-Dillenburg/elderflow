<script setup lang="ts">
import Tag from "primevue/tag";
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
import { formatDate } from "../../i18n";
import { meetingLabel, type TopicHistoryEntry } from "../../api/domain";

defineProps<{
  entry: Extract<TopicHistoryEntry, { kind: "skipped_recurrence" }>;
}>();
const { t } = useI18n();
</script>

<template>
  <article class="history-entry skipped-entry">
    <span class="entry-icon" aria-hidden="true">
      <i class="pi pi-forward" />
    </span>
    <div class="skip-card">
      <div>
        <Tag :value="t('recurringTopic.skipped')" severity="warn" />
        <p>{{ t("topicHistory.skippedExplanation") }}</p>
      </div>
      <div class="skip-meeting">
        <RouterLink :to="`/meetings/${entry.meeting.id}`">
          {{ meetingLabel(entry.meeting) }}
        </RouterLink>
        <time :datetime="entry.effectiveAt">
          {{ formatDate(entry.effectiveAt, { dateStyle: "medium", timeStyle: "short" }) }}
        </time>
      </div>
    </div>
  </article>
</template>

<style scoped>
.entry-icon {
  background: #fff2d9;
  color: #9a6828;
}

.skip-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-width: 0;
  padding: 0.85rem 1rem;
  border: 1px dashed #dfc99f;
  border-radius: 0.8rem;
  background: #fffdf8;
}

.skip-card p {
  margin: 0.35rem 0 0;
  color: #68758a;
  font-size: 0.8rem;
}

.skip-meeting {
  display: grid;
  flex: 0 0 auto;
  gap: 0.25rem;
  text-align: right;
}

.skip-meeting a {
  color: #536f9f;
  font-size: 0.82rem;
  font-weight: 650;
  text-decoration: none;
}

.skip-meeting time {
  color: #7a8799;
  font-size: 0.72rem;
}

@media (max-width: 620px) {
  .skip-card {
    align-items: flex-start;
    flex-direction: column;
  }

  .skip-meeting {
    text-align: left;
  }
}
</style>
