import { Decoder } from 'cbor-x';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from './domain';
import { meetingDocumentSession } from '../e2ee/meeting-document-session';
import { scalarSession } from '../e2ee/scalar-session';
import { bytesToBase64Url } from '../e2ee/protocol';

const targetId = '00000000-0000-4000-8000-000000000901';
const topicId = '00000000-0000-4000-8000-000000000902';
const sectionId = '00000000-0000-4000-8000-000000000903';
const epochId = '00000000-0000-4000-8000-000000000904';
const response = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

afterEach(() => {
  scalarSession.lock();
  meetingDocumentSession.lock();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([false, true])('creates a Meeting during recurrence reconciliation (target already loaded: %s)', async (targetLoaded) => {
  await sodium.ready;
  const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(19), 'uint8array');
  const keys = {
    organizationId: '00000000-0000-4000-8000-000000000905',
    ockId: '00000000-0000-4000-8000-000000000906',
    clientEpochId: epochId,
    noncePrefix: new Uint8Array(16).fill(20),
    contentKey: new Uint8Array(32).fill(21),
    signingPrivateKey: signing.privateKey,
  };
  scalarSession.unlock(keys);
  meetingDocumentSession.unlock(keys);
  const target = await meetingDocumentSession.createInitial(targetId);
  if (!targetLoaded) meetingDocumentSession.discard(targetId);
  else meetingDocumentSession.updateFragment(targetId, 'meeting/general-notes', 'Local preparation draft');
  const workspace = (documentId: string, snapshotId: string, envelope: string) => ({
    documentId, activeSnapshotId: snapshotId, currentServerSequence: '0',
    snapshot: { id: snapshotId, clientEpochId: epochId, snapshotClock: '1',
      signingPublicKey: bytesToBase64Url(signing.publicKey), envelope }, updates: [],
  });
  let created: any;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/meetings' && init?.method === 'POST') {
      const [id, title, documentId, snapshotId, envelope, date, beginTime, status] =
        new Decoder({ mapsAsObjects: false, useRecords: false }).decode(init.body as Uint8Array);
      created = { id, date, beginTime, status, agenda: [],
        protected: { titleEnvelope: bytesToBase64Url(title), titleCommitRevision: '1' },
        workspace: workspace(documentId, snapshotId, bytesToBase64Url(envelope)) };
      return response({ ...created, workspace: undefined });
    }
    if (url === '/api/topics?type=recurring') return response([{ id: topicId, type: 'recurring', protected: null }]);
    if (url === `/api/topics/${topicId}/recurrence-reconciliation`) return response({
      moves: [{ meetingId: targetId, sectionId, position: 1, sourceAppearance: { id: '00000000-0000-4000-8000-000000000907', meetingId: targetId } }], removals: [],
    });
    if (url === `/api/meetings/${targetId}/workspace`) return response(workspace(target.documentId, target.snapshotId, target.snapshotEnvelope));
    if (url === `/api/meetings/${targetId}/topics`) return response({ id: 'appearance', meetingId: targetId, topicId, sectionId, position: 1 });
    if (created && url === `/api/meetings/${created.id}`) return response(created);
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetch);

  const meeting = await api.createMeeting({
    title: 'Preparation', date: '2026-11-14', beginTime: '19:30', status: 'planned',
    meetingLeaderId: null, minuteTakerId: null, generalNotes: null, openingInput: null,
  });
  expect(meeting.id).toBe(created.id);
  expect(meeting.title).toBe('Preparation');
  expect(meetingDocumentSession.hydrateFragments(targetId, []).generalNotes)
    .toBe(targetLoaded ? 'Local preparation draft' : '');
  expect(fetch.mock.calls.filter(([url]) => url === `/api/meetings/${targetId}/workspace`))
    .toHaveLength(targetLoaded ? 0 : 1);
  expect(fetch.mock.calls.filter(([url, init]) => url === `/api/meetings/${targetId}/topics` && init?.method === 'POST')).toHaveLength(1);
});
