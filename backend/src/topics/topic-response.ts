import { isE2eeKeyOperator } from "../e2ee/e2ee-role-policy";
import { User } from "../users/user.entity";
import { TopicUpdate } from "./topic-update.entity";
import { Topic } from "./topic.entity";
import { TOPIC_SCALAR_FIELDS } from "../e2ee/scalar-registry";

const account = (user?: User | null) => user
  ? {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      language: user.language,
    }
  : null;

export function topicResponse(topic: Topic, viewer: User) {
  const canReadProtected = isE2eeKeyOperator(viewer.role)
    && Object.values(TOPIC_SCALAR_FIELDS).every(({ envelopeProperty }) =>
      Buffer.isBuffer(topic[envelopeProperty]));
  return {
    id: topic.id,
    type: topic.type,
    status: topic.status,
    followUpDate: topic.followUpDate,
    responsibleUserId: topic.responsibleUserId,
    responsibleUser: account(topic.responsibleUser),
    membershipStatusSignal: topic.membershipStatusSignal,
    defaultSectionId: topic.defaultSectionId,
    defaultSection: topic.defaultSection
      ? {
          id: topic.defaultSection.id,
          name: topic.defaultSection.name,
          position: topic.defaultSection.position,
          isDefault: topic.defaultSection.isDefault,
        }
      : null,
    defaultPosition: topic.defaultPosition,
    recurrenceFirstDueDate: topic.recurrenceFirstDueDate,
    recurrenceInterval: topic.recurrenceInterval,
    recurrenceUnit: topic.recurrenceUnit,
    nextDueDate: topic.nextDueDate ?? null,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    protected: canReadProtected
      ? Object.fromEntries(Object.values(TOPIC_SCALAR_FIELDS).flatMap(({
          envelopeProperty,
          revisionProperty,
        }) => [
          [envelopeProperty, topic[envelopeProperty].toString("base64url")],
          [revisionProperty, topic[revisionProperty]],
        ]))
      : null,
  };
}

export type TopicResponse = ReturnType<typeof topicResponse>;

export function topicUpdateResponse(update: TopicUpdate, viewer: User) {
  const canReadProtected = isE2eeKeyOperator(viewer.role)
    && Buffer.isBuffer(update.textEnvelope);
  return {
    id: update.id,
    topicId: update.topicId,
    meetingId: update.meetingId,
    date: update.date,
    type: update.type,
    createdBy: account(update.createdBy),
    protected: canReadProtected
      ? {
          textEnvelope: update.textEnvelope!.toString("base64url"),
          textCommitRevision: update.textCommitRevision!,
        }
      : null,
  };
}
