import type { Component } from "vue";
import { canonicalTopicTypes, resolveTopicType, type TopicType } from "./topicTypes";
import { genericTopicRenderers } from "./types/generic";
import { personTopicRenderers } from "./types/person";
import { newMembershipTopicRenderers } from "./types/new-membership";

export { canonicalTopicTypes, resolveTopicType } from "./topicTypes";

export type TopicRendererContext =
  | "form"
  | "preparation"
  | "agenda"
  | "detail"
  | "list";

type TopicTypeRegistration = {
  creationEnabled: boolean;
  agendaPresentation: "standard" | "compact";
  usesPlannedDuration: boolean;
  renderers: Record<TopicRendererContext, Component>;
};

export const topicTypeRegistry: Record<TopicType, TopicTypeRegistration> = {
  generic: {
    creationEnabled: true,
    agendaPresentation: "standard",
    usesPlannedDuration: true,
    renderers: genericTopicRenderers,
  },
  person: {
    creationEnabled: true,
    agendaPresentation: "compact",
    usesPlannedDuration: false,
    renderers: personTopicRenderers,
  },
  new_membership: {
    creationEnabled: true,
    agendaPresentation: "compact",
    usesPlannedDuration: false,
    renderers: newMembershipTopicRenderers,
  },
  recurring: {
    creationEnabled: false,
    agendaPresentation: "standard",
    usesPlannedDuration: true,
    renderers: genericTopicRenderers,
  },
};

export const creatableTopicTypes = (): TopicType[] =>
  canonicalTopicTypes.filter((type) => topicTypeRegistry[type].creationEnabled);

export const topicAgendaClass = (value: string): string[] => {
  const type = resolveTopicType(value);
  const presentation = type ? topicTypeRegistry[type].agendaPresentation : "standard";
  return ["agenda-topic", `agenda-topic-${presentation}`];
};

export const topicUsesPlannedDuration = (value: string): boolean => {
  const type = resolveTopicType(value);
  return type ? topicTypeRegistry[type].usesPlannedDuration : true;
};
