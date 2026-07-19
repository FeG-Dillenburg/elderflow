import type { Component } from "vue";
import type { TopicRendererContext } from "../../topicTypeRegistry";
import PersonTopicAgenda from "./PersonTopicAgenda.vue";
import PersonTopicDetail from "./PersonTopicDetail.vue";
import PersonTopicFormFields from "./PersonTopicFormFields.vue";
import PersonTopicList from "./PersonTopicList.vue";
import PersonTopicPreparation from "./PersonTopicPreparation.vue";

export const personTopicRenderers = {
  form: PersonTopicFormFields,
  preparation: PersonTopicPreparation,
  agenda: PersonTopicAgenda,
  detail: PersonTopicDetail,
  list: PersonTopicList,
} satisfies Record<TopicRendererContext, Component>;
