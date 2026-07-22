<script setup lang="ts">
import ProgressSpinner from "primevue/progressspinner";
import { useI18n } from "vue-i18n";
import type { TopicHistoryEntry } from "../../api/domain";
import MeetingAppearanceHistoryEntry from "./MeetingAppearanceHistoryEntry.vue";
import SkippedRecurrenceHistoryEntry from "./SkippedRecurrenceHistoryEntry.vue";
import StandaloneUpdateHistoryEntry from "./StandaloneUpdateHistoryEntry.vue";

withDefaults(defineProps<{
  entries: TopicHistoryEntry[];
  currentTopicName?: string;
  loading?: boolean;
  error?: string;
}>(), {
  loading: false,
  error: "",
});
const { t } = useI18n();
</script>

<template>
  <div v-if="loading" class="history-state" role="status">
    <ProgressSpinner stroke-width="5" />
    <span>{{ t("topicHistory.loading") }}</span>
  </div>
  <div v-else-if="error" class="history-state history-error" role="alert">
    <i class="pi pi-exclamation-circle" aria-hidden="true" />
    <strong>{{ error }}</strong>
  </div>
  <div v-else-if="!entries.length" class="history-state history-empty">
    <i class="pi pi-clock" aria-hidden="true" />
    <strong>{{ t("topicDetail.noHistory") }}</strong>
    <span>{{ t("topicHistory.emptyHint") }}</span>
  </div>
  <div v-else class="history-timeline">
    <template v-for="entry in entries" :key="entry.id">
      <StandaloneUpdateHistoryEntry
        v-if="entry.kind === 'standalone_update'"
        :entry="entry"
      />
      <MeetingAppearanceHistoryEntry
        v-else-if="entry.kind === 'meeting_appearance'"
        :current-topic-name="currentTopicName"
        :entry="entry"
      />
      <SkippedRecurrenceHistoryEntry
        v-else
        :entry="entry"
      />
    </template>
  </div>
</template>

<style scoped>
.history-timeline {
  position: relative;
  display: grid;
  gap: 1rem;
}

.history-timeline::before {
  position: absolute;
  top: 1.1rem;
  bottom: 1.1rem;
  left: 1.08rem;
  width: 2px;
  background: #dce4ef;
  content: "";
}

.history-state {
  display: grid;
  justify-items: center;
  gap: 0.65rem;
  padding: 2.5rem 1rem;
  color: #718096;
  text-align: center;
}

.history-state :deep(.p-progressspinner) {
  width: 2rem;
  height: 2rem;
}

.history-empty i {
  display: grid;
  width: 2.8rem;
  height: 2.8rem;
  place-items: center;
  border-radius: 50%;
  background: #edf2f8;
  color: #6680aa;
}

.history-error i {
  color: #b42318;
  font-size: 1.5rem;
}

.history-empty strong {
  color: #475569;
}

.history-empty span {
  max-width: 28rem;
  font-size: 0.82rem;
}
</style>

<style src="./history-entry.css"></style>
