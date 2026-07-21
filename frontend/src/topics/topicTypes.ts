export const canonicalTopicTypes = [
  "generic",
  "person",
  "new_membership",
  "recurring",
] as const;

export type TopicType = (typeof canonicalTopicTypes)[number];

export const resolveTopicType = (value: string): TopicType | null =>
  canonicalTopicTypes.find((type) => type === value) ?? null;

export const topicTypeTranslationKey = (value: string): string => {
  const type = resolveTopicType(value);
  return type ? `topicTypes.${type}` : "topicTypes.unknown";
};

const topicNameTranslationKeys: Record<TopicType, string> = {
  generic: "common.name",
  person: "personTopic.nameLabel",
  new_membership: "newMembershipTopic.nameLabel",
  recurring: "common.name",
};

export const topicNameTranslationKey = (type: TopicType): string =>
  topicNameTranslationKeys[type];
