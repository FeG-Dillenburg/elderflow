<script setup lang="ts">
import { computed } from "vue";
import type { MeetingTopic, Topic, TopicFieldPatch, User } from "../../../api/domain";
import NewMembershipTopicAppearance from "./NewMembershipTopicAppearance.vue";
import TopicDoneButton from "../../TopicDoneButton.vue";

const props = defineProps<{
  item: MeetingTopic;
  canEdit: boolean;
  completed?: boolean;
  users: User[];
  saveField: (patch: TopicFieldPatch) => Promise<Topic>;
  meetingStatus?: string;
  canWriteMinutes?: boolean;
  savePreparationContext?: (note: string | null) => Promise<unknown>;
  saveMinutes?: (note: string | null) => Promise<unknown>;
  markDone?: () => Promise<void>;
}>();
const meetingTextMode = computed(() => props.meetingStatus === "in_progress"
  ? "active"
  : props.meetingStatus === "completed"
    ? "completed"
    : "preparation");
const savePreparation = (text: string | null) =>
  props.savePreparationContext?.(text) ?? Promise.resolve();
const saveCurrentMinutes = (text: string | null) =>
  props.saveMinutes?.(text) ?? Promise.resolve();
</script>

<template>
  <div class="membership-agenda">
    <NewMembershipTopicAppearance
      :item="item"
      :can-edit="canEdit"
      :completed="completed"
      :users="users"
      :save-field="saveField"
      :meeting-text-mode="meetingTextMode"
      :can-write-minutes="canWriteMinutes"
      :save-preparation-context="savePreparation"
      :save-minutes="saveCurrentMinutes"
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
