import type { Component } from "vue";
import type { TopicRendererContext } from "../../topicTypeRegistry";
import GenericTopicDetail from "../generic/GenericTopicDetail.vue";
import GenericTopicPreparation from "../generic/GenericTopicPreparation.vue";
import RecurringTopicAgenda from "./RecurringTopicAgenda.vue";
import RecurringTopicFormFields from "./RecurringTopicFormFields.vue";
import RecurringTopicList from "./RecurringTopicList.vue";

export const recurringTopicRenderers = {
  form: RecurringTopicFormFields,
  preparation: GenericTopicPreparation,
  agenda: RecurringTopicAgenda,
  detail: GenericTopicDetail,
  list: RecurringTopicList,
} satisfies Record<TopicRendererContext, Component>;
