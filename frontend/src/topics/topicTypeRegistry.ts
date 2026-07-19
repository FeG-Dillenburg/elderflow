import { canonicalTopicTypes, type TopicType } from "./topicTypes";

export { canonicalTopicTypes, resolveTopicType } from "./topicTypes";

export type TopicRendererContext =
  | "form"
  | "preparation"
  | "agenda"
  | "detail"
  | "list";

type TopicTypeRegistration = {
  creationEnabled: boolean;
  renderers: Record<TopicRendererContext, "generic">;
};

const genericAdapter = (): TopicTypeRegistration["renderers"] => ({
  form: "generic",
  preparation: "generic",
  agenda: "generic",
  detail: "generic",
  list: "generic",
});

export const topicTypeRegistry: Record<TopicType, TopicTypeRegistration> = {
  generic: { creationEnabled: true, renderers: genericAdapter() },
  person: { creationEnabled: false, renderers: genericAdapter() },
  new_membership: { creationEnabled: false, renderers: genericAdapter() },
  recurring: { creationEnabled: false, renderers: genericAdapter() },
};

export const creatableTopicTypes = (): TopicType[] =>
  canonicalTopicTypes.filter((type) => topicTypeRegistry[type].creationEnabled);
