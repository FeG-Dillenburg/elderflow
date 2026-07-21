<script setup lang="ts">
import type { MeetingTopic, Topic, TopicFieldPatch, User } from "../../../api/domain";
import NewMembershipTopicAppearance from "./NewMembershipTopicAppearance.vue";
import NewMembershipTopicList from "./NewMembershipTopicList.vue";

defineProps<{
  topic: Topic;
  item?: MeetingTopic;
  readOnly?: boolean;
  users?: User[];
  saveField?: (patch: TopicFieldPatch) => Promise<Topic>;
  saveNote?: (note: string | null) => Promise<MeetingTopic>;
}>();
</script>

<template>
  <NewMembershipTopicAppearance
    v-if="item && saveField && saveNote"
    :item="item"
    :can-edit="!readOnly"
    :completed="readOnly"
    :users="users ?? []"
    :save-field="saveField"
    :save-note="saveNote"
  />
  <NewMembershipTopicList v-else :topic="topic" />
</template>
