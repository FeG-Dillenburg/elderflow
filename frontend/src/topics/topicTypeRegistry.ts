import type { Component } from "vue";
import { canonicalTopicTypes, type TopicType } from "./topicTypes";
import { genericTopicRenderers } from "./types/generic";

export { canonicalTopicTypes, resolveTopicType } from "./topicTypes";

export type TopicRendererContext =
  | "form"
  | "preparation"
  | "agenda"
  | "detail"
  | "list";

type TopicTypeRegistration = {
  creationEnabled: boolean;
  renderers: Record<TopicRendererContext, Component>;
};

const genericAdapter = (): TopicTypeRegistration["renderers"] =>
  genericTopicRenderers;

export const topicTypeRegistry: Record<TopicType, TopicTypeRegistration> = {
  generic: { creationEnabled: true, renderers: genericAdapter() },
  person: { creationEnabled: false, renderers: genericAdapter() },
  new_membership: { creationEnabled: false, renderers: genericAdapter() },
  recurring: { creationEnabled: false, renderers: genericAdapter() },
};

export const creatableTopicTypes = (): TopicType[] =>
  canonicalTopicTypes.filter((type) => topicTypeRegistry[type].creationEnabled);
