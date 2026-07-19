<script setup lang="ts">
import type { MeetingTopic } from "../../api/domain";
import { formatUser } from "../../api/domain";

defineProps<{ item: MeetingTopic }>();
</script>

<template>
  <div>
    <h3>{{ item.topic?.name }}</h3>
    <p>{{ formatUser(item.topic?.responsibleUser) }}</p>
  </div>
</template>
