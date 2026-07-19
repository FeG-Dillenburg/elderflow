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
