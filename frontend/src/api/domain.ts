import type { SupportedLanguage } from '../i18n/language';
import { localizeApiError, type ApiErrorPayload } from '../i18n/api-errors';
import { formatDate, translate } from '../i18n';
import type { TopicType } from '../topics/topicTypes';
import type { InitialKeyState, PublicKeyState, RecoveryKeyState } from '../e2ee/crypto';
import { Encoder } from 'cbor-x';
import { base64UrlToBytes, bytesToBase64Url, E2EE_MEDIA_TYPE } from '../e2ee/protocol';
import { applyProtectedTextVisibility, getProtectedTextDevelopmentHeaders } from '../e2ee/content-visibility';
import {
  protectStandaloneUpdate,
  protectTopicInput,
  protectTopicPatch,
  unprotectTopic,
  unprotectTopicHistory,
  unprotectTopicSnapshot,
  unprotectTopicUpdate,
  type EncryptedTopicResponse,
  type EncryptedTopicSnapshot,
  type EncryptedTopicUpdateResponse,
} from '../e2ee/topic-scalars';
export type { TopicType } from '../topics/topicTypes';
export type RecurrenceUnit = 'weeks' | 'months';
export type AgendaAppearanceSource = 'manual' | 'recurrence';

export const membershipStatusSignals = ['new', 'in_progress', 'nearly_finished', 'attention', 'paused'] as const;
export type MembershipStatusSignal = (typeof membershipStatusSignals)[number];

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  language: SupportedLanguage | null;
}

export type UserRole = 'superadmin' | 'it-admin' | 'admin' | 'user' | 'guest';
export type PermissionLevel = 'manage' | 'view' | 'hide';
export type PermissionCategory = 'dashboard' | 'users' | 'references' | 'meetings' | 'topics' | 'tasks' | 'contentSettings' | 'authSettings';
export type UserPermissions = Record<PermissionCategory, PermissionLevel>;
export interface AuthUser extends User { permissions: UserPermissions }

export interface InitialUserInput {
  defaultLanguage: SupportedLanguage;
  setupPassword: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  e2ee: InitialKeyState;
}

export interface AgendaSection {
  id: string;
  name: string;
  position: number;
  isDefault: boolean;
}

interface TopicBase {
  id: string;
  name: string;
  description: string | null;
  status: string;
  followUpDate: string | null;
  responsibleUserId: string | null;
  responsibleUser?: User | null;
  defaultSectionId: string | null;
  defaultSection?: AgendaSection | null;
  defaultPosition: number | null;
  nextDueDate?: string | null;
  createdAt: string;
  updatedAt: string;
  updates?: TopicUpdate[];
  tasks?: Task[];
}

type MembershipTopicFields = {
  type: 'new_membership';
  membershipProcessStatus: string | null;
  membershipStatusSignal: MembershipStatusSignal;
  godparents: string | null;
  recurrenceFirstDueDate: null;
  recurrenceInterval: null;
  recurrenceUnit: null;
};

type NonMembershipTopicFields = {
  type: Exclude<TopicType, 'new_membership' | 'recurring'>;
  membershipProcessStatus: null;
  membershipStatusSignal: null;
  godparents: null;
  recurrenceFirstDueDate: null;
  recurrenceInterval: null;
  recurrenceUnit: null;
};

type RecurringTopicFields = {
  type: 'recurring';
  followUpDate: null;
  defaultSectionId: string;
  recurrenceFirstDueDate: string;
  recurrenceInterval: number;
  recurrenceUnit: RecurrenceUnit;
  membershipProcessStatus: null;
  membershipStatusSignal: null;
  godparents: null;
};

export type Topic = TopicBase & (
  MembershipTopicFields | NonMembershipTopicFields | RecurringTopicFields
);

interface TopicInputBase {
  name: string;
  description: string | null;
  status: string;
  followUpDate: string | null;
  responsibleUserId: string | null;
  defaultSectionId: string | null;
  defaultPosition: number | null;
}

type MembershipTopicInputFields = {
  type: 'new_membership';
  membershipProcessStatus?: string | null;
  membershipStatusSignal?: MembershipStatusSignal | null;
  godparents?: string | null;
  recurrenceFirstDueDate?: null;
  recurrenceInterval?: null;
  recurrenceUnit?: null;
};

type NonMembershipTopicInputFields = {
  type: Exclude<TopicType, 'new_membership' | 'recurring'>;
  membershipProcessStatus?: null;
  membershipStatusSignal?: null;
  godparents?: null;
  recurrenceFirstDueDate?: null;
  recurrenceInterval?: null;
  recurrenceUnit?: null;
};

type RecurringTopicInputFields = {
  type: 'recurring';
  defaultSectionId: string;
  followUpDate: null;
  recurrenceFirstDueDate: string;
  recurrenceInterval: number;
  recurrenceUnit: RecurrenceUnit;
  membershipProcessStatus?: null;
  membershipStatusSignal?: null;
  godparents?: null;
};

export type TopicInput = TopicInputBase & (
  MembershipTopicInputFields | NonMembershipTopicInputFields | RecurringTopicInputFields
);

export interface Meeting {
  id: string;
  title: string | null;
  date: string;
  beginTime: string;
  status: string;
  meetingLeaderId: string | null;
  meetingLeader?: User | null;
  minuteTakerId: string | null;
  minuteTaker?: User | null;
  generalNotes: string | null;
  openingInput: string | null;
  participants?: MeetingParticipant[];
  agenda?: MeetingTopic[];
}

export type MeetingInput = Omit<Meeting, 'id' | 'meetingLeader' | 'minuteTaker' | 'participants' | 'agenda'>;

export interface MeetingParticipant {
  id: string;
  userId: string;
  attendanceStatus: string;
  user?: User;
}

export interface VersionedMeetingText {
  id: string | null;
  text: string | null;
  version: number;
}

export interface MeetingAppearanceTexts {
  preparationContext: VersionedMeetingText | null;
  personNote: VersionedMeetingText | null;
  meetingMinutes: VersionedMeetingText | null;
}

export interface PreviousMeetingTexts {
  preparationContext: string | null;
  meetingMinutes: string | null;
}

export interface MeetingTopic {
  id: string;
  meetingId: string;
  topicId: string;
  sectionId: string;
  section?: AgendaSection;
  topic?: Topic;
  position: number;
  agendaNote: string | null;
  noteVersion?: number;
  preparationContext?: VersionedMeetingText | null;
  personNote?: VersionedMeetingText | null;
  meetingMinutes?: VersionedMeetingText | null;
  previousMeetingTexts?: PreviousMeetingTexts | null;
  source?: AgendaAppearanceSource;
  noteEditedAt?: string | null;
  deferredAt?: string | null;
  plannedDuration: number | null;
  status: string;
  topicNameSnapshot?: string | null;
  responsibleUserDisplayNameSnapshot?: string | null;
  membershipProcessStatusSnapshot?: string | null;
  membershipStatusSignalSnapshot?: MembershipStatusSignal | null;
  godparentsSnapshot?: string | null;
  protectedSnapshot?: EncryptedTopicSnapshot | null;
  meeting?: Meeting;
}

export interface SkippedRecurrence {
  id: string;
  topicId: string;
  meetingId: string;
  meeting?: Meeting;
  createdAt: string;
}

export interface TopicUpdate {
  id: string;
  topicId: string;
  meetingId: string | null;
  meeting?: Meeting | null;
  date: string;
  text: string;
  type: string;
  createdBy?: User | null;
}

export interface TopicHistoryMeeting {
  id: string;
  title: string | null;
  date: string;
  beginTime: string;
  status: string;
  minuteTakerDisplayName: string | null;
}

export interface TopicHistoryTopicDisplay {
  type: TopicType;
  name: string | null;
  responsibleUserDisplayName: string | null;
  membershipProcessStatus: string | null;
  membershipStatusSignal: MembershipStatusSignal | null;
  godparents: string | null;
}

export interface TopicHistoryMinutesEntry {
  id: string;
  effectiveAt: string;
  text: string;
  createdByDisplayName: string | null;
}

export type TopicHistoryEntry =
  | {
      id: string;
      kind: 'standalone_update';
      effectiveAt: string;
      updateId: string;
      text: string;
      createdByDisplayName: string | null;
    }
  | {
      id: string;
      kind: 'meeting_appearance';
      effectiveAt: string;
      appearanceId: string | null;
      deferredAt: string | null;
      meeting: TopicHistoryMeeting;
      section: Pick<AgendaSection, 'id' | 'name'> | null;
      topic: TopicHistoryTopicDisplay;
      preparationContext: string | null;
      personNote: string | null;
      meetingMinutes: TopicHistoryMinutesEntry | null;
      legacyMinutesEntries: TopicHistoryMinutesEntry[];
    }
  | {
      id: string;
      kind: 'skipped_recurrence';
      effectiveAt: string;
      skippedRecurrenceId: string;
      meeting: TopicHistoryMeeting;
    };

export interface Task {
  id: string;
  title: string;
  description: string | null;
  topicId: string | null;
  topic?: Topic | null;
  meetingId: string | null;
  meeting?: Meeting | null;
  assignedToId: string | null;
  assignedTo?: User | null;
  dueDate: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export type TaskInput = Omit<Task, 'id' | 'topic' | 'meeting' | 'assignedTo' | 'createdAt' | 'completedAt'>;

export type StructuralTopicFieldPatch = Partial<Pick<
  Topic,
  'responsibleUserId' | 'membershipStatusSignal'
>>;

type ProtectedTopicFieldPatch = Partial<Pick<
  Topic,
  'membershipProcessStatus' | 'godparents'
>>;

export type TopicFieldPatch =
  | (StructuralTopicFieldPatch & {
      membershipProcessStatus?: never;
      godparents?: never;
    })
  | (ProtectedTopicFieldPatch & {
      responsibleUserId?: never;
      membershipStatusSignal?: never;
    });

export interface DashboardData {
  nextMeeting: Meeting | null;
  myOpenTasks: Task[];
  overdueTasks: Task[];
  followUpTopics: Topic[];
  recentTopics: Topic[];
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const cborEncoder = new Encoder({ mapsAsObjects: false, structuredClone: false, tagUint8Array: false, useRecords: false });
import { getSessionToken } from '../auth/session';

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getSessionToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...getProtectedTextDevelopmentHeaders(),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
    notifyAuthorizationLoss(payload);
    throw new Error(localizeApiError(payload, translate));
  }
  if (response.status === 204 || response.headers?.get('content-length') === '0') return undefined as T;
  return applyProtectedTextVisibility(await response.json()) as T;
}

async function requestBinary(path: string): Promise<string> {
  const token = getSessionToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Accept: E2EE_MEDIA_TYPE, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
    notifyAuthorizationLoss(payload);
    throw new Error(localizeApiError(payload, translate));
  }
  if (!response.headers.get('content-type')?.replaceAll(' ', '').startsWith(E2EE_MEDIA_TYPE)) {
    throw new Error('E2EE_BINARY_RESPONSE_INVALID');
  }
  return bytesToBase64Url(new Uint8Array(await response.arrayBuffer()));
}

async function requestWithBinaryBody<T>(path: string, body: Uint8Array, headers: Record<string, string> = {}): Promise<T> {
  const token = getSessionToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    body: Uint8Array.from(body),
    headers: { 'Content-Type': E2EE_MEDIA_TYPE, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
    notifyAuthorizationLoss(payload);
    throw new Error(localizeApiError(payload, translate));
  }
  return response.json() as Promise<T>;
}

function notifyAuthorizationLoss(payload: ApiErrorPayload | null): void {
  if (typeof window !== 'undefined' && ['AUTH_SESSION_REVOKED', 'AUTH_USER_NOT_FOUND'].includes(payload?.code ?? '')) {
    window.dispatchEvent(new CustomEvent('elderflow:authorization-loss'));
  }
}

function encodeSetupRequest(input: InitialUserInput): Uint8Array {
  return Uint8Array.from(cborEncoder.encode([
    input.defaultLanguage,
    input.setupPassword,
    input.email,
    input.firstName,
    input.lastName,
    input.password,
    [
      input.e2ee.organizationId,
      input.e2ee.orkId,
      input.e2ee.ockId,
      base64UrlToBytes(input.e2ee.sharedPassphraseSlot),
      base64UrlToBytes(input.e2ee.recoverySlot),
      base64UrlToBytes(input.e2ee.contentKeyWrapper),
      input.e2ee.custodyCopiesAcknowledged,
    ],
  ]));
}


const query = (values: Record<string, string | boolean | null | undefined>): string => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const result = params.toString();
  return result ? `?${result}` : '';
};

const unprotectTaskTopic = async (task: Task): Promise<Task> => ({
  ...task,
  topic: task.topic
    ? await unprotectTopic(task.topic as unknown as EncryptedTopicResponse)
    : null,
});

export const api = {
  installation: () => request<{ setupRequired: boolean; defaultLanguage: SupportedLanguage | null }>('/api/installation'),
  verifySetupPassword: (setupPassword: string) => request<{ valid: true }>('/api/setup/verify', { method: 'POST', body: JSON.stringify({ setupPassword }) }),
  createInitialUser: (input: InitialUserInput) => requestWithBinaryBody<User>('/api/setup', encodeSetupRequest(input)),
  login: (input: { email: string; password: string }) => request<{ token: string; user: AuthUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  me: () => request<AuthUser>('/api/auth/me'),
  updateProfile: (input: { email: string; firstName: string; lastName: string; language: SupportedLanguage | null; password?: string }) => request<AuthUser>('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(input) }),
  e2eeKeyMetadata: () => request<Omit<PublicKeyState, 'sharedPassphraseSlot' | 'contentKeyWrapper'>>('/api/e2ee/key-state'),
  e2eeKeyState: async () => {
    const [metadata, sharedPassphraseSlot, contentKeyWrapper] = await Promise.all([
      api.e2eeKeyMetadata(),
      requestBinary('/api/e2ee/key-state/shared-passphrase-slot'),
      requestBinary('/api/e2ee/key-state/content-key-wrapper'),
    ]);
    return { ...metadata, sharedPassphraseSlot, contentKeyWrapper };
  },
  e2eeRecoveryMetadata: async () => {
    const [metadata, sharedPassphraseSlot, contentKeyWrapper, recoverySlot] = await Promise.all([
      request<Omit<RecoveryKeyState, 'sharedPassphraseSlot' | 'contentKeyWrapper' | 'recoverySlot'>>('/api/e2ee/recovery-metadata'),
      requestBinary('/api/e2ee/key-state/shared-passphrase-slot'),
      requestBinary('/api/e2ee/key-state/content-key-wrapper'),
      requestBinary('/api/e2ee/recovery-slot'),
    ]);
    return { ...metadata, sharedPassphraseSlot, contentKeyWrapper, recoverySlot };
  },
  registerE2eeClientEpoch: (input: { id: string; noncePrefix: string; signingPublicKey: string }) => request<{ registered: true }>('/api/e2ee/client-epochs', { method: 'POST', body: JSON.stringify(input) }),
  revokeE2eeClientEpoch: (id: string) => request<void>(`/api/e2ee/client-epochs/${id}/revoke`, { method: 'POST' }),
  startE2eeRecovery: (input: { expectedGeneration: number; candidateFingerprint: string; candidateSharedPassphraseSlot: string }) => requestWithBinaryBody<{ id: string; state: string; expiresAt: string }>(
    '/api/e2ee/recovery-ceremonies',
    base64UrlToBytes(input.candidateSharedPassphraseSlot),
    {
      'X-ElderFlow-Expected-Generation': String(input.expectedGeneration),
      'X-ElderFlow-Candidate-Fingerprint': input.candidateFingerprint,
    },
  ),
  approveE2eeRecovery: (id: string, candidateFingerprint: string) => request<{ id: string; state: string; expiresAt: string }>(`/api/e2ee/recovery-ceremonies/${id}/approve`, { method: 'POST', body: JSON.stringify({ candidateFingerprint }) }),
  e2eeRecoveryCeremony: async (id: string) => {
    const [metadata, candidateSharedPassphraseSlot] = await Promise.all([
      request<{ id: string; state: string; expectedGeneration: number; candidateFingerprint: string; expiresAt: string }>(`/api/e2ee/recovery-ceremonies/${id}`),
      requestBinary(`/api/e2ee/recovery-ceremonies/${id}/candidate-shared-passphrase-slot`),
    ]);
    return { ...metadata, candidateSharedPassphraseSlot };
  },
  activateE2eeRecovery: (id: string) => request<{ activated: true; generation: number }>(`/api/e2ee/recovery-ceremonies/${id}/activate`, { method: 'POST' }),
  confirmE2eeRecoveryPresence: (id: string) => request<{ confirmed: true }>(`/api/e2ee/recovery-ceremonies/${id}/confirm-presence`, { method: 'POST' }),
  abortE2eeRecovery: (id: string) => request<void>(`/api/e2ee/recovery-ceremonies/${id}/abort`, { method: 'POST' }),
  users: () => request<User[]>('/api/users'),
  userDirectory: () => request<User[]>('/api/user-directory'),
  dashboard: async () => {
    const data = await request<DashboardData>('/api/dashboard');
    return {
      ...data,
      myOpenTasks: await Promise.all(data.myOpenTasks.map(unprotectTaskTopic)),
      overdueTasks: await Promise.all(data.overdueTasks.map(unprotectTaskTopic)),
      followUpTopics: await Promise.all(
        data.followUpTopics.map((topic) => unprotectTopic(topic as unknown as EncryptedTopicResponse)),
      ),
      recentTopics: await Promise.all(
        data.recentTopics.map((topic) => unprotectTopic(topic as unknown as EncryptedTopicResponse)),
      ),
    };
  },
  sections: () => request<AgendaSection[]>('/api/agenda-sections'),
  createSection: (input: Omit<AgendaSection, 'id'>) => request<AgendaSection>('/api/agenda-sections', { method: 'POST', body: JSON.stringify(input) }),
  updateSection: (id: string, input: Omit<AgendaSection, 'id'>) => request<AgendaSection>(`/api/agenda-sections/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteSection: (id: string) => request<void>(`/api/agenda-sections/${id}`, { method: 'DELETE' }),
  topics: async (filters: Record<string, string | undefined> = {}) => Promise.all(
    (await request<EncryptedTopicResponse[]>(`/api/topics${query(filters)}`)).map((topic) => unprotectTopic(topic)),
  ),
  topic: async (id: string) => unprotectTopic(await request<EncryptedTopicResponse>(`/api/topics/${id}`)),
  createTopic: async (input: TopicInput) => {
    const encrypted = await protectTopicInput(crypto.randomUUID(), input);
    return unprotectTopic(await request<EncryptedTopicResponse>('/api/topics', {
      method: 'POST',
      body: JSON.stringify(encrypted),
    }));
  },
  updateTopic: async (id: string, input: Partial<TopicInput>) => unprotectTopic(
    await request<EncryptedTopicResponse>(`/api/topics/${id}`, {
      method: 'PUT',
      body: JSON.stringify(await protectTopicPatch(id, input)),
    }),
  ),
  topicUpdates: async (id: string) => Promise.all(
    (await request<EncryptedTopicUpdateResponse[]>(`/api/topics/${id}/updates`))
      .map((update) => unprotectTopicUpdate(update)),
  ),
  topicHistory: async (id: string) => unprotectTopicHistory(
    await request<Array<Record<string, unknown>>>(`/api/topics/${id}/history`),
  ),
  addTopicUpdate: async (id: string, input: { text: string; type: string; meetingId?: string | null }) => {
    const updateId = crypto.randomUUID();
    const encrypted = await protectStandaloneUpdate(updateId, input.text);
    return unprotectTopicUpdate(await request<EncryptedTopicUpdateResponse>(`/api/topics/${id}/updates`, {
      method: 'POST',
      body: JSON.stringify({ ...encrypted, type: input.type }),
    }));
  },
  topicAppearances: (id: string) => request<MeetingTopic[]>(`/api/topics/${id}/appearances`),
  skippedRecurrences: (id: string) => request<SkippedRecurrence[]>(`/api/topics/${id}/skipped-recurrences`),
  meetings: () => request<Meeting[]>('/api/meetings'),
  meeting: async (id: string) => {
    const meeting = await request<Meeting>(`/api/meetings/${id}`);
    if (meeting.agenda) {
      meeting.agenda = await Promise.all(meeting.agenda.map(async (item) => {
        if (!item.topic) return item;
        const encrypted = item.topic as unknown as EncryptedTopicResponse;
        const encryptedUpdates = (item.topic as unknown as { updates?: EncryptedTopicUpdateResponse[] }).updates;
        const topic = await unprotectTopic(encrypted);
        topic.updates = await Promise.all((encryptedUpdates ?? []).map((update) => unprotectTopicUpdate(update)));
        if (item.protectedSnapshot || meeting.status === 'completed') {
          const snapshot = await unprotectTopicSnapshot(item.topicId, item.protectedSnapshot ?? null);
          return {
            ...item,
            topic,
            topicNameSnapshot: snapshot.name,
            membershipProcessStatusSnapshot: snapshot.membershipProcessStatus,
            godparentsSnapshot: snapshot.godparents,
          };
        }
        return { ...item, topic };
      }));
    }
    return meeting;
  },
  createMeeting: (input: MeetingInput) => request<Meeting>('/api/meetings', { method: 'POST', body: JSON.stringify(input) }),
  updateMeeting: (id: string, input: Partial<MeetingInput>) => request<Meeting>(`/api/meetings/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  completeMeeting: (id: string) => request<Meeting>(`/api/meetings/${id}/complete`, { method: 'POST' }),
  meetingSuggestions: async (id: string, options?: { future?: boolean }) => Promise.all(
    (await request<EncryptedTopicResponse[]>(`/api/meetings/${id}/suggestions${query({
      future: options?.future ? true : undefined,
    })}`)).map((topic) => unprotectTopic(topic)),
  ),
  addParticipant: (meetingId: string, input: { userId: string; attendanceStatus: string }) => request<MeetingParticipant>(`/api/meetings/${meetingId}/participants`, { method: 'POST', body: JSON.stringify(input) }),
  removeParticipant: (meetingId: string, userId: string) => request<void>(`/api/meetings/${meetingId}/participants/${userId}`, { method: 'DELETE' }),
  addMeetingTopic: (meetingId: string, input: { topicId: string; sectionId: string; position?: number }) => request<MeetingTopic>(`/api/meetings/${meetingId}/topics`, { method: 'POST', body: JSON.stringify(input) }),
  reorderMeetingTopics: (meetingId: string, items: Array<{ id: string; sectionId: string; position: number }>) => request<MeetingTopic[]>(`/api/meetings/${meetingId}/topics/order`, { method: 'PUT', body: JSON.stringify({ items }) }),
  updateMeetingTopic: (meetingId: string, item: MeetingTopic, options?: { deferred?: boolean }) => request<MeetingTopic>(`/api/meetings/${meetingId}/topics/${item.id}`, { method: 'PUT', body: JSON.stringify({ sectionId: item.sectionId, position: item.position, plannedDuration: item.plannedDuration, status: item.status, deferred: options?.deferred }) }),
  updateMeetingTopicFields: async (
    meetingId: string,
    itemId: string,
    input: StructuralTopicFieldPatch,
  ) => unprotectTopic(
    await request<EncryptedTopicResponse>(`/api/meetings/${meetingId}/topics/${itemId}/fields`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  ),
  updateMeetingPreparationContext: (
    meetingId: string,
    itemId: string,
    input: { text: string | null; version: number },
  ) => request<MeetingAppearanceTexts>(`/api/meetings/${meetingId}/topics/${itemId}/preparation-context`, {
    method: 'PUT',
    body: JSON.stringify(input),
  }),
  updatePersonMeetingNote: (
    meetingId: string,
    itemId: string,
    input: { text: string | null; version: number },
  ) => request<MeetingAppearanceTexts>(`/api/meetings/${meetingId}/topics/${itemId}/person-note`, {
    method: 'PUT',
    body: JSON.stringify(input),
  }),
  updateMeetingMinutes: (
    meetingId: string,
    itemId: string,
    input: { text: string; version: number | null },
  ) => request<MeetingAppearanceTexts>(`/api/meetings/${meetingId}/topics/${itemId}/minutes`, {
    method: 'PUT',
    body: JSON.stringify(input),
  }),
  removeMeetingTopic: (meetingId: string, itemId: string) => request<void>(`/api/meetings/${meetingId}/topics/${itemId}`, { method: 'DELETE' }),
  restoreRecurrence: (meetingId: string, topicId: string) => request<void>(`/api/meetings/${meetingId}/recurrences/${topicId}/restore`, { method: 'POST' }),
  tasks: async (filters: Record<string, string | boolean | undefined> = {}) => Promise.all(
    (await request<Task[]>(`/api/tasks${query(filters)}`)).map(unprotectTaskTopic),
  ),
  createTask: (input: TaskInput) => request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(input) }),
  updateTask: (id: string, input: Partial<TaskInput>) => request<Task>(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
};

export const formatUser = (user?: User | null): string => user ? `${user.firstName} ${user.lastName}` : translate('common.unassigned');
export const meetingLabel = (meeting: Pick<Meeting, 'title' | 'date'>): string => meeting.title || translate('meetings.defaultTitle', { date: formatDate(`${meeting.date}T12:00:00`) });
export const toLocalDate = (date: Date | null): string | null => {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
