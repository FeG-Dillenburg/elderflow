<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { Topic } from "../../../api/domain";

defineProps<{ topic: Topic }>();
</script>

<template>
  <RouterLink class="primary-link" :to="`/topics/${topic.id}`">
    {{ topic.name }}
  </RouterLink>
</template>

<style scoped>
.primary-link {
  font-weight: 700;
  text-decoration: none;
}
</style>
