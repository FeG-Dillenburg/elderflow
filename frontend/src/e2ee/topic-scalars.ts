import type { Topic, TopicHistoryEntry, TopicInput, TopicUpdate } from "../api/domain";
import { translate } from "../i18n";
import { base64UrlToBytes, bytesToBase64Url } from "./protocol";
import { scalarSession, type ScalarFieldContext } from "./scalar-session";
import { meetingDocumentSession, type EncryptedWorkspace } from "./meeting-document-session";
import { unprotectMeetingTitle } from "./meeting-scalars";
import {
  SCALAR_AGGREGATES,
  TOPIC_SCALAR_FIELDS,
  TopicScalarFieldId,
  TopicScalarName,
  UPDATE_SCALAR_FIELDS,
} from "./scalar-registry";

export interface ScalarCryptor {
  isUnlocked(): boolean;
  encrypt(context: ScalarFieldContext, value: string | null): Promise<Uint8Array>;
  decrypt(context: ScalarFieldContext, envelope: Uint8Array): Promise<string | null>;
}

type TopicEnvelopeProperty = (typeof TOPIC_SCALAR_FIELDS)[TopicScalarName]["envelopeProperty"];
type TopicRevisionProperty = (typeof TOPIC_SCALAR_FIELDS)[TopicScalarName]["revisionProperty"];
type EncryptedTopicFields = Record<TopicEnvelopeProperty, string>
  & Partial<Record<TopicRevisionProperty, string>>;
type SnapshotScalarName = Exclude<TopicScalarName, "description">;
type SnapshotScalarField = (typeof TOPIC_SCALAR_FIELDS)[SnapshotScalarName];

export type EncryptedTopicSnapshot = Pick<
  EncryptedTopicFields,
  SnapshotScalarField["envelopeProperty"] | SnapshotScalarField["revisionProperty"]
>;

export interface TopicSnapshotProjection {
  name: string;
  membershipProcessStatus: string | null;
  godparents: string | null;
}

export type EncryptedTopicResponse = Omit<
  Topic,
  "name" | "description" | "membershipProcessStatus" | "godparents"
> & {
  protected: EncryptedTopicFields | null;
};

export type EncryptedTopicRequest = Omit<
  TopicInput,
  "name" | "description" | "membershipProcessStatus" | "godparents"
> & {
  id: string;
  protected: Pick<EncryptedTopicFields,
    "nameEnvelope" | "descriptionEnvelope" | "membershipProcessStatusEnvelope" | "godparentsEnvelope">;
};

export type EncryptedTopicUpdateResponse = Omit<TopicUpdate, "text"> & {
  protected: { textEnvelope: string; textCommitRevision: string } | null;
};

export async function protectTopicInput(
  id: string,
  input: TopicInput,
  cryptor: ScalarCryptor = scalarSession,
): Promise<EncryptedTopicRequest> {
  validateTopicPlaintext(input);
  const protectedFields = Object.fromEntries(await Promise.all(
    Object.entries(TOPIC_SCALAR_FIELDS).map(async ([name, field]) => {
      const value = protectedTopicValue(input, name as TopicScalarName);
      return [field.envelopeProperty, bytesToBase64Url(await encryptField(
        cryptor,
        id,
        field.fieldId,
        value,
      ))];
    }),
  )) as EncryptedTopicRequest["protected"];
  const {
    name: _name,
    description: _description,
    membershipProcessStatus: _membershipProcessStatus,
    godparents: _godparents,
    ...structural
  } = input;
  return {
    ...structural,
    id,
    protected: protectedFields,
  } as EncryptedTopicRequest;
}

export async function protectTopicPatch(
  id: string,
  input: Partial<TopicInput>,
  cryptor: ScalarCryptor = scalarSession,
): Promise<Record<string, unknown>> {
  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new Error(translate("topics.nameRequired"));
  }
  const protectedFields: Partial<EncryptedTopicFields> = {};
  for (const field of Object.values(TOPIC_SCALAR_FIELDS)) {
    const value = input[field.plaintextProperty];
    if (value !== undefined) {
      protectedFields[field.envelopeProperty] = bytesToBase64Url(await encryptField(
        cryptor,
        id,
        field.fieldId,
        value ?? null,
      ));
    }
  }
  const {
    name: _name,
    description: _description,
    membershipProcessStatus: _membershipProcessStatus,
    godparents: _godparents,
    ...structural
  } = input;
  return Object.keys(protectedFields).length
    ? { ...structural, protected: protectedFields }
    : structural;
}

export async function unprotectTopic(
  response: EncryptedTopicResponse,
  cryptor: ScalarCryptor = scalarSession,
): Promise<Topic> {
  const unavailable = !response.protected;
  const placeholder = translate(unavailable
    ? "e2ee.unavailablePlaceholder"
    : "e2ee.lockedPlaceholder");
  if (!response.protected || !cryptor.isUnlocked()) {
    return projectedTopic(response, placeholder, placeholder, placeholder, placeholder);
  }
  try {
    const fields = await decryptTopicFields(cryptor, response.id, response.protected);
    if (fields.name === null || fields.name.trim().length === 0) {
      throw new Error("E2EE_TOPIC_NAME_INVALID");
    }
    return projectedTopic(
      response,
      fields.name,
      fields.description,
      fields.membershipProcessStatus,
      fields.godparents,
    );
  } catch {
    const failed = translate("e2ee.unavailablePlaceholder");
    return projectedTopic(response, failed, failed, failed, failed);
  }
}

export async function protectStandaloneUpdate(
  id: string,
  text: string,
  cryptor: ScalarCryptor = scalarSession,
): Promise<{ id: string; textEnvelope: string }> {
  if (text.trim().length === 0) throw new Error(translate("topicDetail.updateRequired"));
  const envelope = await cryptor.encrypt(
    {
      aggregateType: SCALAR_AGGREGATES.update,
      recordId: id,
      fieldId: UPDATE_SCALAR_FIELDS.text,
    },
    text,
  );
  return { id, textEnvelope: bytesToBase64Url(envelope) };
}

export async function unprotectTopicUpdate(
  response: EncryptedTopicUpdateResponse,
  cryptor: ScalarCryptor = scalarSession,
): Promise<TopicUpdate> {
  const { protected: protectedFields, ...structural } = response;
  if (!protectedFields || !cryptor.isUnlocked()) {
    return {
      ...structural,
      text: translate(protectedFields ? "e2ee.lockedPlaceholder" : "e2ee.unavailablePlaceholder"),
    };
  }
  try {
    return {
      ...structural,
      text: await cryptor.decrypt(
        {
          aggregateType: SCALAR_AGGREGATES.update,
          recordId: response.id,
          fieldId: UPDATE_SCALAR_FIELDS.text,
        },
        base64UrlToBytes(protectedFields.textEnvelope),
      ) ?? "",
    };
  } catch {
    return { ...structural, text: translate("e2ee.unavailablePlaceholder") };
  }
}

export async function unprotectTopicHistory(
  entries: Array<Record<string, unknown>>,
  cryptor: ScalarCryptor = scalarSession,
  workspaces: Map<string, EncryptedWorkspace> = new Map(),
): Promise<TopicHistoryEntry[]> {
  return Promise.all(entries.map(async (entry) => {
    if (entry.kind === "standalone_update") {
      const update = await unprotectTopicUpdate({
        id: entry.updateId as string,
        topicId: "",
        date: entry.effectiveAt as string,
        type: "update",
        createdBy: null,
        protected: entry.protected as EncryptedTopicUpdateResponse["protected"],
      }, cryptor);
      const { protected: _protected, ...structural } = entry;
      return { ...structural, text: update.text } as TopicHistoryEntry;
    }
    if (entry.kind === "meeting_appearance") {
      const unavailable = translate("e2ee.unavailablePlaceholder");
      const topic = entry.topic as Record<string, unknown>;
      const meeting = entry.meeting as Record<string, unknown>;
      const meetingId = meeting.id as string;
      const workspace = workspaces.get(meetingId);
      let preparationContext = unavailable;
      let personNote = unavailable;
      let meetingMinutes: Record<string, unknown> | null = null;
      const appearanceId = entry.appearanceId as string | null;
      if (workspace && appearanceId) {
        try {
          const sessionId = `history:${meetingId}`;
          await meetingDocumentSession.load(sessionId, workspace);
          const values = meetingDocumentSession.hydrateFragments(sessionId, [{
            id: appearanceId,
            person: topic.type === "person",
          }]).appearances.get(appearanceId)!;
          preparationContext = values.preparationContext ?? unavailable;
          personNote = values.personNote ?? unavailable;
          meetingMinutes = values.meetingMinutes === null
            ? null
            : {
                id: appearanceId,
                effectiveAt: (meeting.completedAt as string | null) ?? entry.effectiveAt,
                text: values.meetingMinutes,
                createdByDisplayName: meeting.minuteTakerDisplayName,
              };
        } catch {
          // The unavailable values above are the fail-closed projection.
        }
      }
      const snapshot = await unprotectTopicSnapshot(
        topic.id as string,
        topic.protected as EncryptedTopicSnapshot | null,
        cryptor,
      );
      return {
        ...entry,
        meeting: {
          ...meeting,
          title: await unprotectMeetingTitle(
            meetingId,
            meeting.protected as { titleEnvelope: string; titleCommitRevision: string } | null,
          ),
        },
        topic: {
          ...topic,
          name: snapshot.name,
          membershipProcessStatus: topic.type === "new_membership"
            ? snapshot.membershipProcessStatus
            : null,
          godparents: topic.type === "new_membership" ? snapshot.godparents : null,
        },
        preparationContext,
        personNote,
        meetingMinutes,
      } as unknown as TopicHistoryEntry;
    }
    return entry as TopicHistoryEntry;
  }));
}

export async function unprotectTopicSnapshot(
  recordId: string,
  protectedFields: EncryptedTopicSnapshot | null,
  cryptor: ScalarCryptor = scalarSession,
): Promise<TopicSnapshotProjection> {
  const placeholder = translate(protectedFields
    ? "e2ee.lockedPlaceholder"
    : "e2ee.unavailablePlaceholder");
  if (!protectedFields || !cryptor.isUnlocked()) {
    return { name: placeholder, membershipProcessStatus: placeholder, godparents: placeholder };
  }
  try {
    const name = await decryptField(
      cryptor,
      recordId,
      TOPIC_SCALAR_FIELDS.name.fieldId,
      protectedFields.nameEnvelope,
    );
    const membershipProcessStatus = await decryptField(
      cryptor,
      recordId,
      TOPIC_SCALAR_FIELDS.membershipProcessStatus.fieldId,
      protectedFields.membershipProcessStatusEnvelope,
    );
    const godparents = await decryptField(
      cryptor,
      recordId,
      TOPIC_SCALAR_FIELDS.godparents.fieldId,
      protectedFields.godparentsEnvelope,
    );
    if (name === null || name.trim().length === 0) throw new Error("E2EE_TOPIC_NAME_INVALID");
    return { name, membershipProcessStatus, godparents };
  } catch {
    const failed = translate("e2ee.unavailablePlaceholder");
    return { name: failed, membershipProcessStatus: failed, godparents: failed };
  }
}

function projectedTopic(
  response: EncryptedTopicResponse,
  name: string,
  description: string | null,
  membershipProcessStatus: string | null,
  godparents: string | null,
): Topic {
  const { protected: _protected, ...structural } = response;
  return {
    ...structural,
    name,
    description,
    membershipProcessStatus: response.type === "new_membership" ? membershipProcessStatus : null,
    godparents: response.type === "new_membership" ? godparents : null,
  } as Topic;
}

function encryptField(
  cryptor: ScalarCryptor,
  recordId: string,
  fieldId: TopicScalarFieldId,
  value: string | null,
): Promise<Uint8Array> {
  return cryptor.encrypt({ aggregateType: SCALAR_AGGREGATES.topic, recordId, fieldId }, value);
}

function decryptField(
  cryptor: ScalarCryptor,
  recordId: string,
  fieldId: TopicScalarFieldId,
  envelope: string,
): Promise<string | null> {
  return cryptor.decrypt(
    { aggregateType: SCALAR_AGGREGATES.topic, recordId, fieldId },
    base64UrlToBytes(envelope),
  );
}

async function decryptTopicFields(
  cryptor: ScalarCryptor,
  recordId: string,
  protectedFields: EncryptedTopicFields,
): Promise<Record<TopicScalarName, string | null>> {
  return Object.fromEntries(await Promise.all(Object.entries(TOPIC_SCALAR_FIELDS).map(
    async ([name, field]) => [
      name,
      await decryptField(
        cryptor,
        recordId,
        field.fieldId,
        protectedFields[field.envelopeProperty],
      ),
    ],
  ))) as Record<TopicScalarName, string | null>;
}

function protectedTopicValue(input: TopicInput, name: TopicScalarName): string | null {
  if ((name === "membershipProcessStatus" || name === "godparents")
    && input.type !== "new_membership") {
    return null;
  }
  return input[name] ?? null;
}

function validateTopicPlaintext(input: TopicInput): void {
  if (input.name.trim().length === 0) throw new Error(translate("topics.nameRequired"));
}
