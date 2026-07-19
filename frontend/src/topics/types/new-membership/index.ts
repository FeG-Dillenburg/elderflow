import type { Component } from "vue";
import type { TopicRendererContext } from "../../topicTypeRegistry";
import NewMembershipTopicAgenda from "./NewMembershipTopicAgenda.vue";
import NewMembershipTopicDetail from "./NewMembershipTopicDetail.vue";
import NewMembershipTopicFormFields from "./NewMembershipTopicFormFields.vue";
import NewMembershipTopicList from "./NewMembershipTopicList.vue";
import NewMembershipTopicPreparation from "./NewMembershipTopicPreparation.vue";

export const newMembershipTopicRenderers = {
  form: NewMembershipTopicFormFields,
  preparation: NewMembershipTopicPreparation,
  agenda: NewMembershipTopicAgenda,
  detail: NewMembershipTopicDetail,
  list: NewMembershipTopicList,
} satisfies Record<TopicRendererContext, Component>;
