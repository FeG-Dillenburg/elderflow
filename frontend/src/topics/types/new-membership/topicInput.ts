import type { TopicInput } from "../../../api/domain";

type MembershipFieldName =
  | "membershipProcessStatus"
  | "membershipStatusSignal"
  | "godparents";

type TopicInputDraft = Omit<TopicInput, MembershipFieldName> & Partial<
  Pick<TopicInput, MembershipFieldName>
>;

export const toTopicInput = (input: TopicInputDraft): TopicInput => {
  if (input.type === "new_membership") {
    return {
      ...input,
      membershipProcessStatus: input.membershipProcessStatus ?? null,
      membershipStatusSignal: input.membershipStatusSignal ?? "new",
      godparents: input.godparents ?? null,
    } as TopicInput;
  }
  return {
    ...input,
    membershipProcessStatus: null,
    membershipStatusSignal: null,
    godparents: null,
  } as TopicInput;
};
