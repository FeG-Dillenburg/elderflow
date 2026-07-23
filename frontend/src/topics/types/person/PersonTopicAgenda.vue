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
  font-weight: 800;
  text-decoration: none;
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
