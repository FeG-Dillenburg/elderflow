<script setup lang="ts">
import type { Topic } from "../../api/domain";
import { useI18n } from "vue-i18n";

defineProps<{ topic: Topic }>();
const { t } = useI18n();
</script>

<template>
  <div>
    <strong>{{ topic.name }}</strong>
    <small>{{ t(`topicTypes.${topic.type}`) }}</small>
  </div>
</template>
