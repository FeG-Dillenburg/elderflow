<script setup lang="ts">
import { computed, type Component } from "vue";
import type { Topic } from "../api/domain";
import Message from "primevue/message";
import { useI18n } from "vue-i18n";
import {
  resolveTopicType,
  topicTypeRegistry,
  type TopicRendererContext,
} from "./topicTypeRegistry";

defineOptions({ inheritAttrs: false });
const props = defineProps<{
  type: string;
  context: TopicRendererContext;
  openTopic?: (topic: Topic) => void;
}>();
const { t } = useI18n();
const renderer = computed<Component | null>(() => {
  const type = resolveTopicType(props.type);
  if (!type) return null;
  return topicTypeRegistry[type].renderers[props.context];
});
</script>

<template>
  <component
    :is="renderer"
    v-if="renderer"
    v-bind="{ ...$attrs, ...(context === 'preparation' ? { openTopic } : {}) }"
  >
    <slot />
  </component>
  <Message v-else severity="error">
    {{ t("topicTypes.unknown") }}
  </Message>
</template>
