<script setup lang="ts">
import { RouterLink } from "vue-router";
import TopicTitleLink from "../../components/TopicTitleLink.vue";
import type { MeetingTopic, Topic } from "../../../api/domain";
import { useI18n } from "vue-i18n";
import PersonTopicNote from "./PersonTopicNote.vue";

defineProps<{
  topic: Topic;
  openTopic?: (topic: Topic) => void;
  item?: MeetingTopic;
  readOnly?: boolean;
  showType?: boolean;
  saveNote?: (note: string | null) => Promise<MeetingTopic>;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="person-preparation">
    <PersonTopicNote
      v-if="item"
      :item="item"
      :read-only="Boolean(readOnly)"
      :save="saveNote"
    >
      <template #label>
        <RouterLink :to="`/topics/${topic.id}`" class="person-name">
          {{ topic.name }}:
        </RouterLink>
      </template>
    </PersonTopicNote>
    <template v-else>
      <TopicTitleLink :topic="topic" :open-topic="openTopic" class="person-name">
        {{ topic.name }}
      </TopicTitleLink>
      <small v-if="showType">{{ t("topicTypes.person") }}</small>
    </template>
  </div>
</template>

<style scoped>
.person-preparation {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
  width: 100%;
}

.person-name {
  color: inherit;
  cursor: pointer !important;
  font-weight: 800;
  text-decoration: none;
}

small {
  color: #718096;
  font-size: 0.75rem;
}
</style>
