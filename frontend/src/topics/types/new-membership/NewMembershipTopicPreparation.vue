<script setup lang="ts">
import { computed } from "vue";
import type { MeetingTopic, Topic, TopicFieldPatch, User } from "../../../api/domain";
import NewMembershipTopicAppearance from "./NewMembershipTopicAppearance.vue";
import NewMembershipTopicList from "./NewMembershipTopicList.vue";
import MeetingPreparationContext from "../../components/MeetingPreparationContext.vue";

const props = defineProps<{
  topic: Topic;
  item?: MeetingTopic;
  readOnly?: boolean;
  meetingStatus?: string;
  users?: User[];
  saveField?: (patch: TopicFieldPatch) => Promise<Topic>;
  savePreparationContext?: (note: string | null) => Promise<unknown>;
  saveMinutes?: (note: string | null) => Promise<unknown>;
}>();
const preparationReadOnly = computed(() => Boolean(
  props.readOnly || (props.meetingStatus && props.meetingStatus !== "planned"),
));
</script>

<template>
  <div v-if="item && saveField && savePreparationContext && saveMinutes">
    <NewMembershipTopicAppearance
      :item="item"
      :can-edit="!preparationReadOnly"
      :completed="preparationReadOnly"
      :users="users ?? []"
      :save-field="saveField"
      :meeting-text-mode="preparationReadOnly ? 'completed' : 'preparation'"
      :save-preparation-context="savePreparationContext"
      :save-minutes="saveMinutes"
    >
      <template #before-meeting-texts>
        <MeetingPreparationContext :item="item" />
      </template>
    </NewMembershipTopicAppearance>
  </div>
  <NewMembershipTopicList v-else :topic="topic" />
</template>
