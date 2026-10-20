<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { MeetingTopic, Topic } from "../../../api/domain";
import { useI18n } from "vue-i18n";
import { formatDate } from "../../../i18n";
import PairedMeetingTexts from "../../components/PairedMeetingTexts.vue";
import MeetingPreparationContext from "../../components/MeetingPreparationContext.vue";

defineOptions({ inheritAttrs: false });
defineProps<{
  topic: Topic;
  item?: MeetingTopic;
  showType?: boolean;
  readOnly?: boolean;
  meetingStatus?: string;
  savePreparationContext?: (text: string | null) => Promise<unknown>;
  saveMinutes?: (text: string | null) => Promise<unknown>;
}>();
const { t } = useI18n();
</script>

<template>
  <div>
    <div class="topic-heading">
      <RouterLink :to="`/topics/${topic.id}`" class="topic-name">
        <strong>{{ topic.name }}</strong>
        <i class="pi pi-arrow-up-right topic-link-icon" aria-hidden="true" />
      </RouterLink>
      <slot />
    </div>
    <small v-if="showType">
      {{ t(`topicTypes.${topic.type}`) }}
      <template v-if="topic.followUpDate">
        · {{ formatDate(`${topic.followUpDate}T12:00:00`) }}
      </template>
    </small>
    <MeetingPreparationContext v-if="item" :item="item" />
    <PairedMeetingTexts
      v-if="item"
      :item="item"
      :mode="readOnly || (meetingStatus && meetingStatus !== 'planned')
        ? 'completed'
        : 'preparation'"
      :save-preparation="savePreparationContext"
      :save-minutes="saveMinutes"
    />
  </div>
</template>

<style scoped>
.topic-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
}

.topic-heading ~ :deep(.meeting-preparation-context) {
  margin-top: 0.4rem;
  margin-bottom: 0.4rem;
}

.topic-heading ~ :deep(.paired-meeting-texts) {
  margin-top: 0.4rem;
}

.topic-name {
  min-width: 0;
  overflow-wrap: anywhere;
  color: inherit;
  cursor: pointer !important;
  text-decoration: none;
}

.topic-link-icon {
  margin-left: 0.35rem;
  color: #607dae;
  font-size: 0.85rem;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.topic-name:hover .topic-link-icon,
.topic-name:focus-visible .topic-link-icon {
  opacity: 1 !important;
}

small {
  display: block;
  margin-top: 0.2rem;
  color: #718096;
  font-size: 0.75rem;
}
</style>
