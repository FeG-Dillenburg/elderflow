<script setup lang="ts">
import type { MeetingTopic, Topic, TopicFieldPatch, User } from "../../../api/domain";
import NewMembershipTopicAppearance from "./NewMembershipTopicAppearance.vue";
import TopicDoneButton from "../../TopicDoneButton.vue";

defineProps<{
  item: MeetingTopic;
  canEdit: boolean;
  completed?: boolean;
  users: User[];
  saveField: (patch: TopicFieldPatch) => Promise<Topic>;
  saveNote: (note: string | null) => Promise<MeetingTopic>;
  markDone?: () => Promise<void>;
}>();
</script>

<template>
  <div class="membership-agenda">
    <NewMembershipTopicAppearance
      :item="item"
      :can-edit="canEdit"
      :completed="completed"
      :users="users"
      :save-field="saveField"
      :save-note="saveNote"
    />
    <div
      v-if="
        canEdit &&
        (item.topic?.membershipStatusSignal === 'nearly_finished' ||
          item.topic?.status === 'done')
      "
      class="lifecycle-actions"
    >
      <TopicDoneButton
        :done="item.topic?.status === 'done'"
        size="small"
        @toggle="markDone"
      />
    </div>
  </div>
</template>

<style scoped>
.membership-agenda {
  display: grid;
  gap: 0.35rem;
  width: 100%;
}

.lifecycle-actions {
  display: flex;
  justify-content: end;
}
</style>
