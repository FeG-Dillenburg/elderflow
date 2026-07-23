<script setup lang="ts">
import type { MeetingTopic, Topic } from "../../../api/domain";
import { useI18n } from "vue-i18n";
import { formatDate } from "../../../i18n";
import PairedMeetingTexts from "../../components/PairedMeetingTexts.vue";

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
    <strong>{{ topic.name }}</strong>
    <small v-if="showType">
      {{ t(`topicTypes.${topic.type}`) }}
      <template v-if="topic.followUpDate">
        · {{ formatDate(`${topic.followUpDate}T12:00:00`) }}
      </template>
    </small>
    <PairedMeetingTexts
      v-if="item && savePreparationContext && saveMinutes"
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
small {
  display: block;
  margin-top: 0.2rem;
  color: #718096;
  font-size: 0.75rem;
}
</style>
