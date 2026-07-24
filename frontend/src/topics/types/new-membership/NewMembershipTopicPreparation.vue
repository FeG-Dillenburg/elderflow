<script setup lang="ts">
import { computed } from "vue";
import type { MeetingTopic, Topic, TopicFieldPatch, User } from "../../../api/domain";
import NewMembershipTopicAppearance from "./NewMembershipTopicAppearance.vue";
import NewMembershipTopicList from "./NewMembershipTopicList.vue";

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
  <NewMembershipTopicAppearance
    v-if="item && saveField && savePreparationContext && saveMinutes"
    :item="item"
    :can-edit="!preparationReadOnly"
    :completed="preparationReadOnly"
    :users="users ?? []"
    :save-field="saveField"
    :meeting-text-mode="preparationReadOnly ? 'completed' : 'preparation'"
    :save-preparation-context="savePreparationContext"
    :save-minutes="saveMinutes"
  />
  <NewMembershipTopicList v-else :topic="topic" />
</template>
