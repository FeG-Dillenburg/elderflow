<script setup lang="ts">
import { computed, type Component } from "vue";
import Message from "primevue/message";
import { useI18n } from "vue-i18n";
import GenericTopicAgenda from "./components/GenericTopicAgenda.vue";
import GenericTopicDetail from "./components/GenericTopicDetail.vue";
import GenericTopicFormFields from "./components/GenericTopicFormFields.vue";
import GenericTopicList from "./components/GenericTopicList.vue";
import GenericTopicPreparation from "./components/GenericTopicPreparation.vue";
import {
  resolveTopicType,
  topicTypeRegistry,
  type TopicRendererContext,
} from "./topicTypeRegistry";

defineOptions({ inheritAttrs: false });
const props = defineProps<{ type: string; context: TopicRendererContext }>();
const { t } = useI18n();
const components: Record<TopicRendererContext, Component> = {
  form: GenericTopicFormFields,
  preparation: GenericTopicPreparation,
  agenda: GenericTopicAgenda,
  detail: GenericTopicDetail,
  list: GenericTopicList,
};
const renderer = computed<Component | null>(() => {
  const type = resolveTopicType(props.type);
  if (!type) return null;
  const adapter = topicTypeRegistry[type].renderers[props.context];
  return adapter === "generic" ? components[props.context] : null;
});
</script>

<template>
  <component :is="renderer" v-if="renderer" v-bind="$attrs" />
  <Message v-else severity="error">
    {{ t("topicTypes.unknown") }}
  </Message>
</template>
