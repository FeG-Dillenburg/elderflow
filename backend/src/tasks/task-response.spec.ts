import { taskResponse } from './task-response';

describe('taskResponse', () => {
  const task = {
    id: 'task',
    titleEnvelope: Buffer.from('title'),
    titleCommitRevision: '2',
    descriptionEnvelope: Buffer.from('description'),
    descriptionCommitRevision: '3',
    topicId: 'topic',
    topic: {
      id: 'topic',
      nameEnvelope: Buffer.from('topic-name'),
      nameCommitRevision: '4',
      descriptionEnvelope: Buffer.from('must-not-leak'),
    },
    meetingId: 'meeting',
    meeting: {
      id: 'meeting',
      titleEnvelope: Buffer.from('meeting-title'),
      titleCommitRevision: '5',
      title: 'must-not-leak',
      date: '2026-07-20',
      beginTime: '19:30',
      status: 'planned',
      generalNotes: 'must-not-leak',
    },
    assignedToId: 'assigned',
    assignedTo: {
      id: 'assigned',
      email: 'assigned@example.com',
      firstName: 'Assigned',
      lastName: 'User',
      role: 'user',
      language: 'en',
      passwordHash: 'must-not-leak',
    },
    dueDate: '2026-07-21',
    status: 'open',
    createdAt: new Date('2026-07-15T10:00:00Z'),
    completedAt: null,
  } as any;

  it('returns only Task ciphertext and endpoint-specific related-record projections', () => {
    const result = taskResponse(task, { role: 'user' } as any);

    expect(result).toEqual({
      id: 'task',
      topicId: 'topic',
      topic: {
        id: 'topic',
        protected: {
          nameEnvelope: Buffer.from('topic-name').toString('base64url'),
          nameCommitRevision: '4',
        },
      },
      meetingId: 'meeting',
      meeting: {
        id: 'meeting',
        protected: {
          titleEnvelope: Buffer.from('meeting-title').toString('base64url'),
          titleCommitRevision: '5',
        },
        date: '2026-07-20',
        beginTime: '19:30',
        status: 'planned',
      },
      assignedToId: 'assigned',
      assignedTo: {
        id: 'assigned',
        email: 'assigned@example.com',
        firstName: 'Assigned',
        lastName: 'User',
        role: 'user',
        language: 'en',
      },
      dueDate: '2026-07-21',
      status: 'open',
      createdAt: new Date('2026-07-15T10:00:00Z'),
      completedAt: null,
      protected: {
        titleEnvelope: Buffer.from('title').toString('base64url'),
        titleCommitRevision: '2',
        descriptionEnvelope: Buffer.from('description').toString('base64url'),
        descriptionCommitRevision: '3',
      },
    });
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
  });

  it.each(['guest', 'it-admin'])('withholds all Protected ciphertext from %s', (role) => {
    const result = taskResponse(task, { role } as any);

    expect(result.protected).toBeNull();
    expect(result.topic?.protected).toBeNull();
    expect(JSON.stringify(result)).not.toContain(Buffer.from('title').toString('base64url'));
  });
});
