<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { MeetingTopic } from "../../../api/domain";
import PersonTopicNote from "./PersonTopicNote.vue";
import TopicDoneButton from "../../TopicDoneButton.vue";

defineOptions({ inheritAttrs: false });

defineProps<{
  item: MeetingTopic;
  canEdit: boolean;
  saveNote: (note: string | null) => Promise<MeetingTopic>;
  markDone?: () => Promise<void>;
}>();

</script>

<template>
  <div class="person-agenda">
    <div class="person-line">
      <PersonTopicNote
        :item="item"
        :read-only="!canEdit"
        :save="saveNote"
      >
        <template #label>
          <RouterLink :to="`/topics/${item.topicId}`" class="person-name">
            {{ item.topicNameSnapshot ?? item.topic?.name }}:
            <i class="pi pi-arrow-up-right topic-link-icon" aria-hidden="true" />
          </RouterLink>
        </template>
      </PersonTopicNote>
      <span v-if="canEdit" class="lifecycle-actions">
        <TopicDoneButton
          :done="item.topic?.status === 'done'"
          size="small"
          @toggle="markDone"
        />
      </span>
    </div>
  </div>
</template>

<style scoped>
.person-line {
  display: flex;
  align-items: start;
  gap: 0.35rem;
}

.person-line :deep(.note-editor),
.person-line :deep(.read-only-note) {
  flex: 1;
  min-width: 0;
}

.person-name {
  color: inherit;
  cursor: pointer;
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
  opacity: 1;
}

.lifecycle-actions {
  display: flex;
  flex: none;
  margin-left: auto;
}

@media (max-width: 700px) {
  .person-line {
    flex-wrap: wrap;
  }

  .lifecycle-actions {
    width: 100%;
    justify-content: end;
  }
}
</style>
