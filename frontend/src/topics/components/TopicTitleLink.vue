<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
import type { Topic } from "../../api/domain";

defineProps<{
  topic: Topic;
  openTopic?: (topic: Topic) => void;
}>();
const { t } = useI18n();
</script>

<template>
  <button
    v-if="openTopic"
    type="button"
    class="preview-trigger"
    aria-haspopup="dialog"
    :aria-label="t('topicPreview.open', { name: topic.name })"
    @pointerdown.stop
    @click.stop="openTopic(topic)"
  >
    <slot />
  </button>
  <RouterLink v-else :to="`/topics/${topic.id}`">
    <slot />
  </RouterLink>
</template>

<style scoped>
.preview-trigger {
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: start;
}
</style>
