// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, type TaskInput } from '../api/domain';
import vectors from '../../../docs/security/e2ee-v1-key-vectors.json';
import { setProtectedContentUnlocked } from './content-visibility';
import { translate } from '../i18n';
import { base64UrlToBytes, bytesToBase64Url } from './protocol';
import { SCALAR_AGGREGATES, TASK_SCALAR_FIELDS } from './scalar-registry';
import { scalarSession } from './scalar-session';
import {
  protectTaskInput,
  protectTaskPatch,
  unprotectTask,
  type EncryptedTaskResponse,
  type EncryptedTaskSummaryResponse,
} from './task-scalars';

const evidenceApiUrl = process.env.E2EE_EVIDENCE_API_URL;
const evidence = evidenceApiUrl ? describe : describe.skip;
const phase = process.env.E2EE_EVIDENCE_PHASE ?? 'create';
const createsFixture = phase !== 'verify';
const marker = 'EF50_';
const taskId = '00000000-0000-4000-8000-000000000050';
const otherTaskId = '00000000-0000-4000-8000-000000000051';
const guestEmail = 'evidence-guest-50@example.com';
const itAdminEmail = 'evidence-it-admin-50@example.com';
const evidencePassword = 'Evidence-account-50!';

evidence('Task E2EE running instance', () => {
  let token = '';
  let userId = '';

  beforeAll(async () => {
    await sodium.ready;
    const login = await api.login({
      email: 'evidence@example.com',
      password: 'Evidence-account-49!',
    });
    token = login.token;
    userId = login.user.id;
    setProtectedContentUnlocked(true);

    const signing = sodium.crypto_sign_seed_keypair(
      hexToBytes(vectors.signedNullScalar.signingSeedHex),
      'uint8array',
    );
    const noncePrefix = createsFixture
      ? hexToBytes(vectors.clientEpochNonces.firstPrefixHex)
      : hexToBytes(vectors.clientEpochNonces.secondPrefixHex);
    const clientEpochId = createsFixture
      ? '00000000-0000-4000-8000-000000000050'
      : '00000000-0000-4000-8000-000000000051';
    await jsonRequest('/api/e2ee/client-epochs', token, {
      method: 'POST',
      body: JSON.stringify({
        id: clientEpochId,
        noncePrefix: bytesToBase64Url(noncePrefix),
        signingPublicKey: bytesToBase64Url(signing.publicKey),
      }),
    });
    scalarSession.unlock({
      organizationId: vectors.signedNullScalar.organizationId,
      ockId: vectors.signedNullScalar.ockId,
      clientEpochId,
      noncePrefix,
      contentKey: hexToBytes(vectors.signedNullScalar.organizationContentKeyHex),
      signingPrivateKey: signing.privateKey,
    });
  });

  it('records create/edit/complete/dashboard, fail-closed, and restart evidence', async () => {
    if (createsFixture) {
      await createUnauthorizedEvidenceUser(guestEmail, 'guest');
      await createUnauthorizedEvidenceUser(itAdminEmail, 'it-admin');
      await createTask(taskId, {
        ...structuralTaskInput(),
        title: 'EF50_TASK_TITLE_7QX9',
        description: '<p>EF50_TASK_DESCRIPTION_7QX9</p>',
        assignedToId: userId,
      });
      await createTask(otherTaskId, {
        ...structuralTaskInput(),
        title: 'EF50_OTHER_TASK_7QX9',
        description: null,
      });

      const transplanted = await protectTaskPatch(taskId, {
        title: 'EF50_TRANSPLANT_7QX9',
      });
      const transplantResponse = await fetch(`${evidenceApiUrl}/api/tasks/${otherTaskId}`, {
        method: 'PUT',
        headers: requestHeaders(token),
        body: JSON.stringify(transplanted),
      });
      expect(transplantResponse.status).toBe(400);
      await expect(transplantResponse.json()).resolves.toMatchObject({
        code: 'E2EE_ENVELOPE_CONTEXT_INVALID',
      });

      await jsonRequest(`/api/tasks/${taskId}`, token, {
        method: 'PUT',
        body: JSON.stringify(await protectTaskPatch(taskId, {
          title: 'EF50_TASK_EDITED_7QX9',
          description: '<p>EF50_DESCRIPTION_EDITED_7QX9</p>',
          status: 'in_progress',
        })),
      });
      const dashboard = await jsonRequest<{
        myOpenTasks: EncryptedTaskSummaryResponse[];
      }>('/api/dashboard', token);
      expect(dashboard.myOpenTasks.map(({ id }) => id)).toContain(taskId);
      await jsonRequest(`/api/tasks/${taskId}`, token, {
        method: 'PUT',
        body: JSON.stringify({ status: 'done' }),
      });
    }

    const [guestLogin, itAdminLogin] = await Promise.all([
      api.login({ email: guestEmail, password: evidencePassword }),
      api.login({ email: itAdminEmail, password: evidencePassword }),
    ]);

    const encryptedTasks = await jsonRequest<EncryptedTaskResponse[]>(
      '/api/tasks?status=done',
      token,
    );
    const encryptedTask = encryptedTasks.find(({ id }) => id === taskId)!;
    await expect(scalarSession.decrypt({
      aggregateType: SCALAR_AGGREGATES.task,
      recordId: taskId,
      fieldId: TASK_SCALAR_FIELDS.title.fieldId,
    }, base64UrlToBytes(encryptedTask.protected!.titleEnvelope)))
      .resolves.toBe('EF50_TASK_EDITED_7QX9');
    await expect(unprotectTask(encryptedTask)).resolves.toMatchObject({
      title: 'EF50_TASK_EDITED_7QX9',
      description: '<p>EF50_DESCRIPTION_EDITED_7QX9</p>',
      status: 'done',
      completedAt: expect.any(String),
    });

    const rawResponse = await fetch(`${evidenceApiUrl}/api/tasks?status=done`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(rawResponse.headers.get('cache-control')).toBe('no-store');
    expect(await rawResponse.text()).not.toContain(marker);

    const guestResponse = await fetch(`${evidenceApiUrl}/api/tasks?status=done`, {
      headers: { Authorization: `Bearer ${guestLogin.token}` },
    });
    expect(guestResponse.status).toBe(200);
    const guestTasks = await guestResponse.json() as EncryptedTaskResponse[];
    expect(guestTasks.find(({ id }) => id === taskId)?.protected).toBeNull();
    expect(JSON.stringify(guestTasks)).not.toContain(marker);

    const itAdminResponse = await fetch(`${evidenceApiUrl}/api/tasks?status=done`, {
      headers: { Authorization: `Bearer ${itAdminLogin.token}` },
    });
    expect(itAdminResponse.status).toBe(403);
    expect(await itAdminResponse.text()).not.toContain(marker);

    scalarSession.lock();
    setProtectedContentUnlocked(false);
    await expect(unprotectTask(encryptedTask)).resolves.toMatchObject({
      title: translate('e2ee.lockedPlaceholder'),
      status: 'done',
    });
    const browserEvidence = await browserPersistenceEvidence();
    expect(browserEvidence.coverage).toEqual({
      cacheStorage: expect.stringMatching(/^(inspected|source-audited)$/),
      indexedDb: expect.stringMatching(/^(inspected|source-audited)$/),
    });
    expect(browserEvidence.text).not.toContain(marker);
    if (!createsFixture) expect(evidenceArtifactText()).not.toContain(marker);
  });

  async function createUnauthorizedEvidenceUser(
    email: string,
    role: 'guest' | 'it-admin',
  ): Promise<void> {
    await jsonRequest('/api/user', token, {
      method: 'POST',
      body: JSON.stringify({
        email,
        firstName: 'Evidence',
        lastName: role === 'guest' ? 'Guest' : 'IT Admin',
        role,
        password: evidencePassword,
      }),
    });
  }

  async function createTask(id: string, input: TaskInput): Promise<void> {
    await jsonRequest('/api/tasks', token, {
      method: 'POST',
      body: JSON.stringify(await protectTaskInput(id, input)),
    });
  }
});

function structuralTaskInput(): TaskInput {
  return {
    title: '',
    description: null,
    topicId: null,
    meetingId: null,
    assignedToId: null,
    dueDate: '2026-08-20',
    status: 'open',
  };
}

function requestHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function jsonRequest<T = unknown>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${evidenceApiUrl}${path}`, {
    ...init,
    headers: { ...requestHeaders(token), ...init.headers },
  });
  if (!response.ok) {
    throw new Error(`Evidence request ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

function hexToBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

async function browserPersistenceEvidence(): Promise<{
  coverage: { cacheStorage: 'inspected' | 'source-audited'; indexedDb: 'inspected' | 'source-audited' };
  text: string;
}> {
  const inspected: unknown[] = [
    { localStorage: { ...localStorage } },
    { sessionStorage: { ...sessionStorage } },
  ];
  let cacheStorage: 'inspected' | 'source-audited';
  if ('caches' in globalThis) {
    cacheStorage = 'inspected';
    for (const cacheName of await globalThis.caches.keys()) {
      const cache = await globalThis.caches.open(cacheName);
      for (const response of await cache.matchAll()) inspected.push(await response.text());
    }
  } else {
    cacheStorage = 'source-audited';
    expect(productionBrowserPersistenceSource()).not.toMatch(/\b(?:caches|CacheStorage)\b/);
  }
  let indexedDb: 'inspected' | 'source-audited';
  if ('indexedDB' in globalThis && typeof globalThis.indexedDB.databases === 'function') {
    indexedDb = 'inspected';
    for (const info of await globalThis.indexedDB.databases()) {
      if (info.name) inspected.push(await indexedDatabaseValues(info.name));
    }
  } else {
    indexedDb = 'source-audited';
    expect(productionBrowserPersistenceSource()).not.toMatch(/\bindexedDB\b/);
  }
  return {
    coverage: { cacheStorage, indexedDb },
    text: JSON.stringify(inspected),
  };
}

function productionBrowserPersistenceSource(
  directory = join(process.cwd(), 'src'),
): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return productionBrowserPersistenceSource(path);
      if (!/\.(?:ts|vue)$/.test(entry.name) || entry.name.endsWith('.spec.ts')) return [];
      return [readFileSync(path, 'utf8')];
    })
    .join('\n');
}

function indexedDatabaseValues(name: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const stores = Array.from(database.objectStoreNames);
      if (!stores.length) {
        database.close();
        resolve([]);
        return;
      }
      const transaction = database.transaction(stores, 'readonly');
      const values: unknown[] = [];
      for (const store of stores) {
        const all = transaction.objectStore(store).getAll();
        all.onsuccess = () => values.push(all.result);
      }
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        database.close();
        resolve(values);
      };
    };
  });
}

function evidenceArtifactText(): string {
  const dumpPath = process.env.E2EE_EVIDENCE_DATABASE_DUMP;
  const logPath = process.env.E2EE_EVIDENCE_BACKEND_LOG;
  if (!dumpPath || !logPath) {
    throw new Error(
      'E2EE_EVIDENCE_DATABASE_DUMP and E2EE_EVIDENCE_BACKEND_LOG are required for verify',
    );
  }
  return `${readFileSync(dumpPath, 'utf8')}\n${readFileSync(logPath, 'utf8')}`;
}
