import type {
  Task,
  TaskInput,
  TaskMeetingReference,
  TaskTopicReference,
} from '../api/domain';
import { translate } from '../i18n';
import { base64UrlToBytes, bytesToBase64Url } from './protocol';
import {
  SCALAR_AGGREGATES,
  TASK_SCALAR_FIELDS,
  TOPIC_SCALAR_FIELDS,
  type TaskScalarFieldId,
} from './scalar-registry';
import { scalarSession, type ScalarFieldContext } from './scalar-session';

export interface TaskScalarCryptor {
  isUnlocked(): boolean;
  encrypt(context: ScalarFieldContext, value: string | null): Promise<Uint8Array>;
  decrypt(context: ScalarFieldContext, envelope: Uint8Array): Promise<string | null>;
}

interface EncryptedTaskFields {
  titleEnvelope: string;
  titleCommitRevision: string;
  descriptionEnvelope: string;
  descriptionCommitRevision: string;
}

export interface EncryptedTopicLabel {
  id: string;
  protected: {
    nameEnvelope: string;
    nameCommitRevision: string;
  } | null;
}

export type EncryptedTaskResponse = Omit<
  Task,
  'title' | 'description' | 'topic' | 'meeting'
> & {
  protected: EncryptedTaskFields | null;
  topic: EncryptedTopicLabel | null;
  meeting: Omit<TaskMeetingReference, 'title'> | null;
};

export type EncryptedTaskRequest = Omit<TaskInput, 'title' | 'description'> & {
  id: string;
  protected: Pick<EncryptedTaskFields, 'titleEnvelope' | 'descriptionEnvelope'>;
};

export interface EncryptedTaskSummaryResponse {
  id: string;
  topicId: string | null;
  meetingId: string | null;
  assignedToId: string | null;
  assignedTo?: Task['assignedTo'];
  dueDate: string | null;
  status: string;
  completedAt: string | null;
  protected: {
    titleEnvelope: string;
    titleCommitRevision: string;
  } | null;
}

export async function protectTaskInput(
  id: string,
  input: TaskInput,
  cryptor: TaskScalarCryptor = scalarSession,
): Promise<EncryptedTaskRequest> {
  validateTitle(input.title);
  const [titleEnvelope, descriptionEnvelope] = await Promise.all([
    encryptField(cryptor, id, TASK_SCALAR_FIELDS.title.fieldId, input.title),
    encryptField(cryptor, id, TASK_SCALAR_FIELDS.description.fieldId, input.description),
  ]);
  const { title: _title, description: _description, ...structural } = input;
  return {
    ...structural,
    id,
    protected: {
      titleEnvelope: bytesToBase64Url(titleEnvelope),
      descriptionEnvelope: bytesToBase64Url(descriptionEnvelope),
    },
  };
}

export async function protectTaskPatch(
  id: string,
  input: Partial<TaskInput>,
  cryptor: TaskScalarCryptor = scalarSession,
): Promise<Record<string, unknown>> {
  if (input.title !== undefined) validateTitle(input.title);
  const protectedFields: Record<string, string> = {};
  for (const field of Object.values(TASK_SCALAR_FIELDS)) {
    const value = input[field.plaintextProperty];
    if (value !== undefined) {
      protectedFields[field.envelopeProperty] = bytesToBase64Url(await encryptField(
        cryptor,
        id,
        field.fieldId,
        value,
      ));
    }
  }
  const { title: _title, description: _description, ...structural } = input;
  return Object.keys(protectedFields).length
    ? { ...structural, protected: protectedFields }
    : structural;
}

export async function unprotectTask(
  response: EncryptedTaskResponse,
  cryptor: TaskScalarCryptor = scalarSession,
): Promise<Task> {
  const { protected: protectedFields, topic, meeting, ...structural } = response;
  const title = await unprotectTaskTitle(response.id, protectedFields, cryptor);
  const placeholder = translate(protectedFields
    ? 'e2ee.lockedPlaceholder'
    : 'e2ee.unavailablePlaceholder');
  let description: string | null = placeholder;
  if (protectedFields && cryptor.isUnlocked()) {
    try {
      description = await decryptField(
        cryptor,
        idContext(response.id, TASK_SCALAR_FIELDS.description.fieldId),
        protectedFields.descriptionEnvelope,
      );
    } catch {
      description = translate('e2ee.unavailablePlaceholder');
    }
  }
  return {
    ...structural,
    title,
    description,
    topic: await unprotectTopicLabel(topic, cryptor),
    meeting: meeting
      ? { ...meeting, title: translate('e2ee.unavailablePlaceholder') }
      : null,
  } as Task;
}

export async function unprotectTaskSummary(
  response: EncryptedTaskSummaryResponse,
  cryptor: TaskScalarCryptor = scalarSession,
) {
  const { protected: protectedFields, ...structural } = response;
  return {
    ...structural,
    title: await unprotectTaskTitle(response.id, protectedFields, cryptor),
  };
}

async function unprotectTaskTitle(
  id: string,
  protectedFields: Pick<EncryptedTaskFields, 'titleEnvelope'> | null,
  cryptor: TaskScalarCryptor,
): Promise<string> {
  if (!protectedFields) return translate('e2ee.unavailablePlaceholder');
  if (!cryptor.isUnlocked()) return translate('e2ee.lockedPlaceholder');
  try {
    const title = await decryptField(
      cryptor,
      idContext(id, TASK_SCALAR_FIELDS.title.fieldId),
      protectedFields.titleEnvelope,
    );
    if (title === null) throw new Error('E2EE_TASK_TITLE_INVALID');
    validateTitle(title);
    return title;
  } catch {
    return translate('e2ee.unavailablePlaceholder');
  }
}

export async function unprotectTopicLabel(
  topic: EncryptedTopicLabel | null,
  cryptor: TaskScalarCryptor = scalarSession,
): Promise<TaskTopicReference | null> {
  if (!topic) return null;
  const placeholder = translate(topic.protected
    ? 'e2ee.lockedPlaceholder'
    : 'e2ee.unavailablePlaceholder');
  if (!topic.protected || !cryptor.isUnlocked()) return { id: topic.id, name: placeholder };
  try {
    const name = await cryptor.decrypt({
      aggregateType: SCALAR_AGGREGATES.topic,
      recordId: topic.id,
      fieldId: TOPIC_SCALAR_FIELDS.name.fieldId,
    }, base64UrlToBytes(topic.protected.nameEnvelope));
    if (name === null || name.trim().length === 0) throw new Error('E2EE_TOPIC_NAME_INVALID');
    return { id: topic.id, name };
  } catch {
    return { id: topic.id, name: translate('e2ee.unavailablePlaceholder') };
  }
}

function idContext(recordId: string, fieldId: TaskScalarFieldId): ScalarFieldContext {
  return { aggregateType: SCALAR_AGGREGATES.task, recordId, fieldId };
}

function encryptField(
  cryptor: TaskScalarCryptor,
  recordId: string,
  fieldId: TaskScalarFieldId,
  value: string | null,
): Promise<Uint8Array> {
  return cryptor.encrypt(idContext(recordId, fieldId), value);
}

function decryptField(
  cryptor: TaskScalarCryptor,
  context: ScalarFieldContext,
  envelope: string,
): Promise<string | null> {
  return cryptor.decrypt(context, base64UrlToBytes(envelope));
}

function validateTitle(value: string): void {
  if (value.trim().length === 0) throw new Error(translate('tasks.titleRequired'));
}
