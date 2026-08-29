<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { MeetingTopic, Topic } from "../../../api/domain";
import { useI18n } from "vue-i18n";
import PersonTopicNote from "./PersonTopicNote.vue";

defineProps<{
  topic: Topic;
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
      v-if="item && saveNote"
      :item="item"
      :read-only="Boolean(readOnly)"
      :save="saveNote"
    >
      <template #label>
        <RouterLink :to="`/topics/${topic.id}`" class="person-name">
          {{ topic.name }}:
          <i class="pi pi-arrow-up-right topic-link-icon" aria-hidden="true" />
        </RouterLink>
      </template>
    </PersonTopicNote>
    <template v-else>
      <RouterLink :to="`/topics/${topic.id}`" class="person-name">
        {{ topic.name }}
        <i class="pi pi-arrow-up-right topic-link-icon" aria-hidden="true" />
      </RouterLink>
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

.topic-link-icon {
  margin-left: 0.2rem;
  color: #607dae;
  font-size: 0.8rem;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.person-name:hover .topic-link-icon,
.person-name:focus-visible .topic-link-icon {
  opacity: 1 !important;
}

small {
  color: #718096;
  font-size: 0.75rem;
}
</style>
