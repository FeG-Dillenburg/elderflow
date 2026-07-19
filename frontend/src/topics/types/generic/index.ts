import type { Component } from "vue";
import type { TopicRendererContext } from "../../topicTypeRegistry";
import GenericTopicAgenda from "./GenericTopicAgenda.vue";
import GenericTopicDetail from "./GenericTopicDetail.vue";
import GenericTopicFormFields from "./GenericTopicFormFields.vue";
import GenericTopicList from "./GenericTopicList.vue";
import GenericTopicPreparation from "./GenericTopicPreparation.vue";

export const genericTopicRenderers = {
  form: GenericTopicFormFields,
  preparation: GenericTopicPreparation,
  agenda: GenericTopicAgenda,
  detail: GenericTopicDetail,
  list: GenericTopicList,
} satisfies Record<TopicRendererContext, Component>;
