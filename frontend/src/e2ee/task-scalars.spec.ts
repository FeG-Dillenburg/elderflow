import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../i18n';
import {
  protectTaskInput,
  protectTaskPatch,
  unprotectTask,
  unprotectTaskSummary,
  type EncryptedTaskResponse,
} from './task-scalars';
import { SCALAR_AGGREGATES, TASK_SCALAR_FIELDS } from './scalar-registry';

describe('Task scalar projections', () => {
  const encrypt = vi.fn(async ({ fieldId }, value: string | null) =>
    Uint8Array.of(fieldId, value === null ? 0 : value.length));
  const decrypt = vi.fn(async ({ fieldId }) => fieldId === TASK_SCALAR_FIELDS.title.fieldId
    ? 'Call family'
    : '<p>Discuss next steps</p>');
  const cryptor = { isUnlocked: () => true, encrypt, decrypt };
  const id = '00000000-0000-4000-8000-000000000050';
  const input = {
    title: 'Call family',
    description: '<p>Discuss next steps</p>',
    topicId: null,
    meetingId: null,
    assignedToId: null,
    dueDate: null,
    status: 'open',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    i18n.global.locale.value = 'en';
  });

  it('encrypts title and description under the Task aggregate and removes plaintext', async () => {
    const result = await protectTaskInput(id, input, cryptor as any);

    expect(result).toMatchObject({
      id,
      status: 'open',
      protected: {
        titleEnvelope: expect.any(String),
        descriptionEnvelope: expect.any(String),
      },
    });
    expect(result).not.toHaveProperty('title');
    expect(result).not.toHaveProperty('description');
    expect(encrypt).toHaveBeenNthCalledWith(1, {
      aggregateType: SCALAR_AGGREGATES.task,
      recordId: id,
      fieldId: TASK_SCALAR_FIELDS.title.fieldId,
    }, 'Call family');
    expect(encrypt).toHaveBeenNthCalledWith(2, expect.objectContaining({
      aggregateType: SCALAR_AGGREGATES.task,
      fieldId: TASK_SCALAR_FIELDS.description.fieldId,
    }), '<p>Discuss next steps</p>');
  });

  it('keeps completion structural-only and encrypts only changed Protected fields', async () => {
    await expect(protectTaskPatch(id, { status: 'done' }, cryptor as any))
      .resolves.toEqual({ status: 'done' });
    await expect(protectTaskPatch(id, { description: null }, cryptor as any))
      .resolves.toEqual({ protected: { descriptionEnvelope: expect.any(String) } });
  });

  it('decrypts Task content and the encrypted Topic label while keeping Meeting labels unavailable', async () => {
    const response = {
      id,
      topicId: 'topic',
      topic: {
        id: 'topic',
        protected: { nameEnvelope: 'AQ', nameCommitRevision: '1' },
      },
      meetingId: 'meeting',
      meeting: {
        id: 'meeting',
        date: '2026-08-20',
        beginTime: '19:30',
        status: 'planned',
      },
      assignedToId: null,
      assignedTo: null,
      dueDate: null,
      status: 'open',
      createdAt: '2026-08-11T00:00:00Z',
      completedAt: null,
      protected: {
        titleEnvelope: 'AQ',
        titleCommitRevision: '1',
        descriptionEnvelope: 'Ag',
        descriptionCommitRevision: '1',
      },
    } as EncryptedTaskResponse;

    const result = await unprotectTask(response, cryptor as any);

    expect(result.title).toBe('Call family');
    expect(result.description).toBe('<p>Discuss next steps</p>');
    expect(result.topic?.name).toBe('Call family');
    expect(result.meeting?.title).toBe('Protected text is unavailable.');
  });

  it('uses locked and unavailable placeholders without retaining ciphertext', async () => {
    const response = {
      id,
      topicId: null,
      topic: null,
      meetingId: null,
      meeting: null,
      assignedToId: null,
      assignedTo: null,
      dueDate: null,
      status: 'open',
      createdAt: '2026-08-11T00:00:00Z',
      completedAt: null,
      protected: {
        titleEnvelope: 'secret-title',
        titleCommitRevision: '1',
        descriptionEnvelope: 'secret-description',
        descriptionCommitRevision: '1',
      },
    } as EncryptedTaskResponse;
    const locked = await unprotectTask(response, {
      ...cryptor,
      isUnlocked: () => false,
    } as any);
    const unavailable = await unprotectTask({ ...response, protected: null }, cryptor as any);

    expect(locked.title).toBe('Unlock Protected text to view this content.');
    expect(unavailable.title).toBe('Protected text is unavailable.');
    expect(JSON.stringify(locked)).not.toContain('secret-title');
  });

  it('decrypts a dashboard title without requiring or retaining a description envelope', async () => {
    const result = await unprotectTaskSummary({
      id,
      topicId: null,
      meetingId: null,
      assignedToId: null,
      assignedTo: null,
      dueDate: null,
      status: 'open',
      completedAt: null,
      protected: { titleEnvelope: 'AQ', titleCommitRevision: '1' },
    }, cryptor as any);

    expect(result).toMatchObject({ title: 'Call family', status: 'open' });
    expect(result).not.toHaveProperty('description');
    expect(result).not.toHaveProperty('protected');
  });
});
