<script setup lang="ts">
import type { MeetingTopic } from "../../../api/domain";
import { formatUser } from "../../../api/domain";

defineProps<{ item: MeetingTopic }>();
</script>

<template>
  <div>
    <h3>{{ item.topic?.name }}</h3>
    <p>
      {{
        item.responsibleUserDisplayNameSnapshot ??
        formatUser(item.topic?.responsibleUser)
      }}
    </p>
  </div>
</template>

<style scoped>
h3 {
  margin: 0;
  font-size: 1.05rem;
}

p {
  margin: 0.25rem 0 0;
}
</style>
