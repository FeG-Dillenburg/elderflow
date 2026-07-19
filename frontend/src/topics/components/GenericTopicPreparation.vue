<script setup lang="ts">
import type { Topic } from "../../api/domain";
import { useI18n } from "vue-i18n";

defineProps<{ topic: Topic; showType?: boolean }>();
const { t } = useI18n();
</script>

<template>
  <div>
    <strong>{{ topic.name }}</strong>
    <small v-if="showType">{{ t(`topicTypes.${topic.type}`) }}</small>
  </div>
</template>

<style scoped>
small {
  display: block;
  margin-top: 0.2rem;
  color: #718096;
  font-size: 0.75rem;
}
</style>
