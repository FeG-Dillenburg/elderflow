<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { MeetingTopic } from "../../../api/domain";
import RecurringTopicNote from "./RecurringTopicNote.vue";
import { useI18n } from "vue-i18n";

defineOptions({ inheritAttrs: false });
defineProps<{
  item: MeetingTopic;
  number?: string;
  canEdit?: boolean;
  saveNote: (note: string | null) => Promise<MeetingTopic>;
}>();
const { t } = useI18n();
</script>

<template>
  <div class="recurring-agenda">
    <span class="number">{{ number }}</span>
    <div>
      <RouterLink :to="`/topics/${item.topicId}`" class="topic-name">
        {{ item.topicNameSnapshot ?? item.topic?.name }}
      </RouterLink>
      <RecurringTopicNote
        :item="item"
        :read-only="!canEdit"
        :save="saveNote"
      />
    </div>
    <span v-if="item.plannedDuration" class="duration">
      {{ item.plannedDuration }} {{ t("common.minuteShort") }}
    </span>
  </div>
</template>

<style scoped>
.recurring-agenda {
  display: grid;
  grid-template-columns: 72px 1fr auto;
  gap: 0.7rem;
}

.number,
.topic-name {
  font-weight: 800;
}

.number {
  color: #607dae;
}

.topic-name {
  display: block;
  margin-bottom: 0.45rem;
  text-decoration: none;
}

@media (max-width: 700px) {
  .recurring-agenda {
    grid-template-columns: 1fr;
  }
}
</style>
