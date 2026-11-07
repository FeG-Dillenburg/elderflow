<script setup lang="ts">
import TopicTitleLink from "../../components/TopicTitleLink.vue";
import type { Topic } from "../../../api/domain";
import MembershipSignal from "./MembershipSignal.vue";

defineProps<{
  topic: Topic;
  openTopic?: (topic: Topic) => void;
}>();
</script>

<template>
  <div class="membership-list">
    <TopicTitleLink class="primary-link" :topic="topic" :open-topic="openTopic">
      {{ topic.name }}
    </TopicTitleLink>
    <div class="summary">
      <MembershipSignal
        :signal="topic.membershipStatusSignal ?? 'new'"
        :text="topic.membershipProcessStatus"
      />
    </div>
  </div>
</template>

<style scoped>
.primary-link {
  display: block;
  font-weight: 750;
  text-decoration: none;
}

.summary {
  display: flex;
  align-items: center;
  min-width: 0;
  margin-top: 0.25rem;
}
</style>
