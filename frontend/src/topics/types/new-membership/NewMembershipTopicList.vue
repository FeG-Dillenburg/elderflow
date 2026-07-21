<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { Topic } from "../../../api/domain";
import MembershipSignal from "./MembershipSignal.vue";

defineProps<{ topic: Topic }>();
</script>

<template>
  <div class="membership-list">
    <RouterLink class="primary-link" :to="`/topics/${topic.id}`">
      {{ topic.name }}
    </RouterLink>
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
