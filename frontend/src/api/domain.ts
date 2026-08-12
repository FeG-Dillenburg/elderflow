import type { SupportedLanguage } from '../i18n/language';
import { localizeApiError, type ApiErrorPayload } from '../i18n/api-errors';
import { formatDate, translate } from '../i18n';
import type { TopicType } from '../topics/topicTypes';
import type { InitialKeyState, PublicKeyState, RecoveryKeyState } from '../e2ee/crypto';
import { Encoder } from 'cbor-x';
import { base64UrlToBytes, bytesToBase64Url, E2EE_MEDIA_TYPE } from '../e2ee/protocol';
import { protectMeetingTitle, unprotectMeetingTitle, type EncryptedMeetingTitle } from '../e2ee/meeting-scalars';
import {
  meetingDocumentSession,
  type EncryptedWorkspace,
} from '../e2ee/meeting-document-session';
import { meetingFragmentId } from '../e2ee/meeting-document-codec';
import { scalarSession } from '../e2ee/scalar-session';
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
import {
  protectTaskInput,
  protectTaskPatch,
  unprotectTask,
  unprotectTaskSummary,
  unprotectTopicLabel,
  type EncryptedTaskResponse,
  type EncryptedTaskSummaryResponse,
  type EncryptedTopicLabel,
} from '../e2ee/task-scalars';
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
  workspace?: EncryptedWorkspace | null;
  collaboration?: { available: false };
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

export interface MeetingTopic {
  id: string;
  meetingId: string;
  topicId: string;
  sectionId: string;
  section?: AgendaSection;
  topic?: Topic;
  position: number;
  preparationContext?: VersionedMeetingText | null;
  personNote?: VersionedMeetingText | null;
  meetingMinutes?: VersionedMeetingText | null;
  source?: AgendaAppearanceSource;
  contentEditedAt?: string | null;
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
  previousAppearance?: { appearanceId: string; meetingId: string } | null;
}

export interface SkippedRecurrence {
  id: string;
  topicId: string;
  meetingId: string;
  meeting?: Meeting;
  createdAt: string;
}

interface RecurrenceReconciliationPlan {
  moves: Array<{
    meetingId: string;
    sectionId: string;
    position: number;
    sourceAppearance: { id: string; meetingId: string } | null;
  }>;
  removals: Array<{ id: string; meetingId: string }>;
}

export interface TopicUpdate {
  id: string;
  topicId: string;
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
  topic?: TaskTopicReference | null;
  meetingId: string | null;
  meeting?: TaskMeetingReference | null;
  assignedToId: string | null;
  assignedTo?: User | null;
  dueDate: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export interface TaskTopicReference {
  id: string;
  name: string;
}

export interface TaskMeetingReference {
  id: string;
  title: string | null;
  date: string;
  beginTime: string;
  status: string;
}

export interface TaskReferences {
  topics: TaskTopicReference[];
  meetings: TaskMeetingReference[];
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

export interface DashboardTopicSummary {
  id: string;
  name: string;
  status: string;
  followUpDate: string | null;
  responsibleUserId: string | null;
  responsibleUser?: User | null;
}

export interface DashboardTaskSummary {
  id: string;
  title: string;
  topicId: string | null;
  meetingId: string | null;
  assignedToId: string | null;
  assignedTo?: User | null;
  dueDate: string | null;
  status: string;
  completedAt: string | null;
}

export interface DashboardData {
  nextMeeting: Pick<Meeting, 'id' | 'title' | 'date' | 'beginTime' | 'status' | 'meetingLeaderId' | 'meetingLeader'> | null;
  myOpenTasks: DashboardTaskSummary[];
  overdueTasks: DashboardTaskSummary[];
  followUpTopics: DashboardTopicSummary[];
  recentTopics: DashboardTopicSummary[];
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  ?? (import.meta.env.PROD ? '' : 'http://localhost:3000');
const cborEncoder = new Encoder({ mapsAsObjects: false, structuredClone: false, tagUint8Array: false, useRecords: false });
import { getSessionToken } from '../auth/session';

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getSessionToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
    notifyAuthorizationLoss(payload);
    throw new Error(localizeApiError(payload, translate));
  }
  if (response.status === 204 || response.headers?.get('content-length') === '0') return undefined as T;
  return await response.json() as T;
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

function encodeMeetingCreateRequest(
  id: string,
  titleEnvelope: string,
  document: { documentId: string; snapshotId: string; snapshotEnvelope: string },
  input: Omit<MeetingInput, 'title' | 'generalNotes' | 'openingInput'>,
): Uint8Array {
  return Uint8Array.from(cborEncoder.encode([
    id,
    base64UrlToBytes(titleEnvelope),
    document.documentId,
    document.snapshotId,
    base64UrlToBytes(document.snapshotEnvelope),
    input.date,
    input.beginTime,
    input.status,
    input.meetingLeaderId ?? null,
    input.minuteTakerId ?? null,
  ]));
}

function encodeMeetingTopicMutation(input: {
  id: string;
  mutationId: string;
  topicId: string;
  sectionId: string;
  initialUpdateEnvelope: string;
  source?: 'manual' | 'recurrence';
  position?: number;
  plannedDuration?: number | null;
  sourceAppearanceId?: string;
}): Uint8Array {
  return Uint8Array.from(cborEncoder.encode([
    input.id,
    input.mutationId,
    input.topicId,
    input.sectionId,
    base64UrlToBytes(input.initialUpdateEnvelope),
    input.source ?? null,
    input.source !== undefined,
    input.position ?? null,
    input.position !== undefined,
    input.plannedDuration ?? null,
    input.plannedDuration !== undefined,
    input.sourceAppearanceId ?? null,
    input.sourceAppearanceId !== undefined,
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

type EncryptedDashboardTopicSummary = Omit<DashboardTopicSummary, 'name'> & EncryptedTopicLabel;
type EncryptedDashboardData = Omit<DashboardData, 'myOpenTasks' | 'overdueTasks' | 'followUpTopics' | 'recentTopics' | 'nextMeeting'> & {
  nextMeeting: (Omit<NonNullable<DashboardData['nextMeeting']>, 'title'> & EncryptedMeetingTitle) | null;
  myOpenTasks: EncryptedTaskSummaryResponse[];
  overdueTasks: EncryptedTaskSummaryResponse[];
  followUpTopics: EncryptedDashboardTopicSummary[];
  recentTopics: EncryptedDashboardTopicSummary[];
};

type EncryptedMeetingResponse = Omit<Meeting, 'title' | 'generalNotes' | 'openingInput'>
  & EncryptedMeetingTitle;

const unprotectMeeting = async (response: EncryptedMeetingResponse): Promise<Meeting> => {
  const { protected: protectedTitle, ...structural } = response;
  const meeting: Meeting = {
    ...structural,
    title: await unprotectMeetingTitle(response.id, protectedTitle),
    generalNotes: null,
    openingInput: null,
  };
  if (!response.workspace) return meeting;
  try {
    await meetingDocumentSession.load(response.id, response.workspace);
    const fragments = meetingDocumentSession.hydrateFragments(
      response.id,
      (response.agenda ?? []).map((item) => ({
        id: item.id,
        person: item.topic?.type === 'person',
      })),
    );
    meeting.generalNotes = fragments.generalNotes;
    meeting.openingInput = fragments.openingInput;
    meeting.agenda = (response.agenda ?? []).map((item) => {
      const values = fragments.appearances.get(item.id)!;
      const preparationContext = values.preparationContext === null
        ? null
        : { id: item.id, text: values.preparationContext, version: 0 };
      const personNote = values.personNote === null
        ? null
        : { id: item.id, text: values.personNote, version: 0 };
      const meetingMinutes = values.meetingMinutes === null
        ? null
        : { id: item.id, text: values.meetingMinutes, version: 0 };
      return {
        ...item,
        preparationContext,
        personNote,
        meetingMinutes,
      };
    });
  } catch {
    const placeholder = translate(scalarSession.isUnlocked()
      ? 'e2ee.unavailablePlaceholder'
      : 'e2ee.lockedPlaceholder');
    meeting.generalNotes = placeholder;
    meeting.openingInput = placeholder;
    meeting.agenda = (response.agenda ?? []).map((item) => ({
      ...item,
      preparationContext: item.topic?.type === 'person'
        ? null
        : { id: item.id, text: placeholder, version: 0 },
      personNote: item.topic?.type === 'person'
        ? { id: item.id, text: placeholder, version: 0 }
        : null,
      meetingMinutes: item.topic?.type === 'person'
        ? null
        : { id: item.id, text: placeholder, version: 0 },
    }));
  }
  return meeting;
};

const unprotectDashboardTopic = async (
  response: EncryptedDashboardTopicSummary,
): Promise<DashboardTopicSummary> => {
  const { protected: _protected, ...structural } = response;
  return {
    ...structural,
    name: (await unprotectTopicLabel(response))?.name
      ?? translate('e2ee.unavailablePlaceholder'),
  };
};

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
    const data = await request<EncryptedDashboardData>('/api/dashboard');
    return {
      ...data,
      nextMeeting: data.nextMeeting
        ? {
            ...data.nextMeeting,
            title: await unprotectMeetingTitle(data.nextMeeting.id, data.nextMeeting.protected),
          }
        : null,
      myOpenTasks: await Promise.all(data.myOpenTasks.map((task) => unprotectTaskSummary(task))),
      overdueTasks: await Promise.all(data.overdueTasks.map((task) => unprotectTaskSummary(task))),
      followUpTopics: await Promise.all(data.followUpTopics.map(unprotectDashboardTopic)),
      recentTopics: await Promise.all(data.recentTopics.map(unprotectDashboardTopic)),
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
    const topic = await unprotectTopic(await request<EncryptedTopicResponse>('/api/topics', {
      method: 'POST',
      body: JSON.stringify(encrypted),
    }));
    if (topic.type === 'recurring') await reconcileRecurringTopic(topic);
    return topic;
  },
  updateTopic: async (id: string, input: Partial<TopicInput>) => {
    const topic = await unprotectTopic(await request<EncryptedTopicResponse>(`/api/topics/${id}`, {
      method: 'PUT',
      body: JSON.stringify(await protectTopicPatch(id, input)),
    }));
    if (topic.type === 'recurring') await reconcileRecurringTopic(topic);
    return topic;
  },
  topicUpdates: async (id: string) => Promise.all(
    (await request<EncryptedTopicUpdateResponse[]>(`/api/topics/${id}/updates`))
      .map((update) => unprotectTopicUpdate(update)),
  ),
  topicHistory: async (id: string) => {
    const entries = await request<Array<Record<string, unknown>>>(`/api/topics/${id}/history`);
    if (!scalarSession.isUnlocked()) return unprotectTopicHistory(entries);
    const meetingIds = [...new Set(entries
      .filter((entry) => entry.kind === 'meeting_appearance')
      .map((entry) => (entry.meeting as { id: string }).id))];
    const workspaces = new Map<string, EncryptedWorkspace>();
    await Promise.all(meetingIds.map(async (meetingId) => {
      const workspace = await request<EncryptedWorkspace | null>(
        `/api/meetings/${meetingId}/workspace`,
      );
      if (workspace) workspaces.set(meetingId, workspace);
    }));
    return unprotectTopicHistory(entries, undefined, workspaces);
  },
  addTopicUpdate: async (id: string, input: { text: string; type: string }) => {
    const updateId = crypto.randomUUID();
    const encrypted = await protectStandaloneUpdate(updateId, input.text);
    return unprotectTopicUpdate(await request<EncryptedTopicUpdateResponse>(`/api/topics/${id}/updates`, {
      method: 'POST',
      body: JSON.stringify({ ...encrypted, type: input.type }),
    }));
  },
  topicAppearances: (id: string, options?: { beforeMeetingId?: string }) => request<MeetingTopic[]>(
    `/api/topics/${id}/appearances${query({ beforeMeetingId: options?.beforeMeetingId })}`,
  ),
  skippedRecurrences: (id: string) => request<SkippedRecurrence[]>(`/api/topics/${id}/skipped-recurrences`),
  meetings: async () => Promise.all(
    (await request<EncryptedMeetingResponse[]>('/api/meetings')).map((meeting) =>
      unprotectMeeting(meeting)),
  ),
  meeting: async (id: string) => {
    const meeting = await unprotectMeeting(
      await request<EncryptedMeetingResponse>(`/api/meetings/${id}`),
    );
    if (meeting.agenda) {
      meeting.agenda = await Promise.all(meeting.agenda.map(async (item) => {
        if (!item.topic) return item;
        const encrypted = item.topic as unknown as EncryptedTopicResponse;
        const encryptedUpdates = (item.topic as unknown as { updates?: EncryptedTopicUpdateResponse[] }).updates;
        const encryptedTasks = (item.topic as unknown as { tasks?: EncryptedTaskSummaryResponse[] }).tasks;
        const topic = await unprotectTopic(encrypted);
        topic.updates = await Promise.all((encryptedUpdates ?? []).map((update) => unprotectTopicUpdate(update)));
        topic.tasks = await Promise.all(
          (encryptedTasks ?? []).map((task) => unprotectTaskSummary(task)),
        ) as Task[];
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
  createMeeting: async (input: MeetingInput) => {
    const id = crypto.randomUUID();
    const document = await meetingDocumentSession.createInitial(id);
    const { title, generalNotes: _generalNotes, openingInput: _openingInput, ...structural } = input;
    await unprotectMeeting(await requestWithBinaryBody<EncryptedMeetingResponse>(
      '/api/meetings',
      encodeMeetingCreateRequest(
        id,
        await protectMeetingTitle(id, title),
        document,
        structural,
      ),
    ));
    await reconcileAllRecurringTopics();
    return api.meeting(id);
  },
  updateMeeting: async (id: string, input: Partial<MeetingInput>) => {
    const { title, generalNotes, openingInput, ...structural } = input;
    const body: Record<string, unknown> = { ...structural };
    if (title !== undefined) {
      body.protected = { titleEnvelope: await protectMeetingTitle(id, title) };
    }
    if (generalNotes !== undefined) {
      await api.appendMeetingWorkspaceUpdate(
        id,
        await meetingDocumentSession.createFragmentUpdate(
          id,
          'meeting/general-notes',
          generalNotes ?? '',
        ),
      );
    }
    if (openingInput !== undefined) {
      await api.appendMeetingWorkspaceUpdate(
        id,
        await meetingDocumentSession.createFragmentUpdate(
          id,
          'meeting/opening-input',
          openingInput ?? '',
        ),
      );
    }
    const saved = await unprotectMeeting(await request<EncryptedMeetingResponse>(`/api/meetings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }));
    if (input.date !== undefined || input.status !== undefined) {
      await reconcileAllRecurringTopics();
    }
    return saved;
  },
  appendMeetingWorkspaceUpdate: async (
    id: string,
    envelope: string,
    appearanceId?: string,
  ) => {
    try {
      return await requestWithBinaryBody<{
        status: 'accepted' | 'duplicate';
        updateId: string;
        serverSequence: string;
      }>(
        `/api/meetings/${id}/workspace/updates`,
        base64UrlToBytes(envelope),
        appearanceId ? { 'X-ElderFlow-Appearance-Id': appearanceId } : {},
      );
    } catch (error) {
      try {
        const workspace = await request<EncryptedWorkspace | null>(`/api/meetings/${id}/workspace`);
        if (workspace) await meetingDocumentSession.load(id, workspace);
        else meetingDocumentSession.discard(id);
      } catch {
        meetingDocumentSession.discard(id);
      }
      throw error;
    }
  },
  completeMeeting: async (id: string) => {
    const meeting = await unprotectMeeting(
      await request<EncryptedMeetingResponse>(`/api/meetings/${id}/complete`, { method: 'POST' }),
    );
    await reconcileAllRecurringTopics();
    return meeting;
  },
  meetingSuggestions: async (id: string, options?: { future?: boolean }) => Promise.all(
    (await request<EncryptedTopicResponse[]>(`/api/meetings/${id}/suggestions${query({
      future: options?.future ? true : undefined,
    })}`)).map((topic) => unprotectTopic(topic)),
  ),
  addParticipant: (meetingId: string, input: { userId: string; attendanceStatus: string }) => request<MeetingParticipant>(`/api/meetings/${meetingId}/participants`, { method: 'POST', body: JSON.stringify(input) }),
  removeParticipant: (meetingId: string, userId: string) => request<void>(`/api/meetings/${meetingId}/participants/${userId}`, { method: 'DELETE' }),
  addMeetingTopic: async (
    meetingId: string,
    input: {
      topicId: string;
      sectionId: string;
      position?: number;
      topic?: Topic;
      source?: 'manual' | 'recurrence';
      sourceAppearance?: { id: string; meetingId: string } | null;
    },
  ) => {
    const appearanceId = crypto.randomUUID();
    const person = input.topic?.type === 'person';
    let initialText = input.topic?.type === 'recurring' ? input.topic.description ?? '' : '';
    if (person || input.topic?.type === 'recurring') {
      const priorAppearance = input.sourceAppearance
        ?? (await api.topicAppearances(input.topicId, { beforeMeetingId: meetingId }))[0];
      if (priorAppearance) {
        const priorWorkspace = await request<EncryptedWorkspace | null>(
          `/api/meetings/${priorAppearance.meetingId}/workspace`,
        );
        if (priorWorkspace) {
          const sessionId = `copy-forward:${priorAppearance.meetingId}`;
          await meetingDocumentSession.load(sessionId, priorWorkspace);
          const priorValues = meetingDocumentSession.hydrateFragments(sessionId, [{
            id: priorAppearance.id,
            person,
          }]).appearances.get(priorAppearance.id);
          initialText = person
            ? priorValues?.personNote ?? ''
            : priorValues?.preparationContext ?? '';
        }
      }
    }
    const initialUpdateEnvelope = await meetingDocumentSession.createFragmentUpdate(
      meetingId,
      meetingFragmentId(person ? 'personNote' : 'preparationContext', appearanceId),
      initialText,
    );
    const {
      topic: _topic,
      sourceAppearance,
      ...structural
    } = input;
    try {
      return await requestWithBinaryBody<MeetingTopic>(
        `/api/meetings/${meetingId}/topics`,
        encodeMeetingTopicMutation({
          ...structural,
          id: appearanceId,
          mutationId: crypto.randomUUID(),
          sourceAppearanceId: sourceAppearance?.id,
          initialUpdateEnvelope,
        }),
      );
    } catch (error) {
      try {
        const workspace = await request<EncryptedWorkspace | null>(
          `/api/meetings/${meetingId}/workspace`,
        );
        if (workspace) await meetingDocumentSession.load(meetingId, workspace);
        else meetingDocumentSession.discard(meetingId);
      } catch {
        meetingDocumentSession.discard(meetingId);
      }
      throw error;
    }
  },
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
  updateMeetingPreparationContext: async (
    meetingId: string,
    itemId: string,
    input: { text: string | null; version: number },
  ): Promise<MeetingAppearanceTexts> => {
    const envelope = await meetingDocumentSession.createFragmentUpdate(
      meetingId,
      meetingFragmentId('preparationContext', itemId),
      input.text ?? '',
    );
    await api.appendMeetingWorkspaceUpdate(meetingId, envelope, itemId);
    return {
      preparationContext: { id: itemId, text: input.text, version: input.version + 1 },
      personNote: null,
      meetingMinutes: null,
    };
  },
  updatePersonMeetingNote: async (
    meetingId: string,
    itemId: string,
    input: { text: string | null; version: number },
  ): Promise<MeetingAppearanceTexts> => {
    const envelope = await meetingDocumentSession.createFragmentUpdate(
      meetingId,
      meetingFragmentId('personNote', itemId),
      input.text ?? '',
    );
    await api.appendMeetingWorkspaceUpdate(meetingId, envelope, itemId);
    return {
      preparationContext: null,
      personNote: { id: itemId, text: input.text, version: input.version + 1 },
      meetingMinutes: null,
    };
  },
  updateMeetingMinutes: async (
    meetingId: string,
    itemId: string,
    input: { text: string; version: number | null },
  ): Promise<MeetingAppearanceTexts> => {
    const envelope = await meetingDocumentSession.createFragmentUpdate(
      meetingId,
      meetingFragmentId('meetingMinutes', itemId),
      input.text,
    );
    await api.appendMeetingWorkspaceUpdate(meetingId, envelope);
    return {
      preparationContext: null,
      personNote: null,
      meetingMinutes: { id: itemId, text: input.text, version: (input.version ?? 0) + 1 },
    };
  },
  removeMeetingTopic: async (meetingId: string, itemId: string) => {
    await request<void>(`/api/meetings/${meetingId}/topics/${itemId}`, { method: 'DELETE' });
    await reconcileAllRecurringTopics();
  },
  restoreRecurrence: async (meetingId: string, topicId: string) => {
    await request<void>(`/api/meetings/${meetingId}/recurrences/${topicId}/restore`, { method: 'POST' });
    const topic = await api.topic(topicId);
    if (topic.type === 'recurring') await reconcileRecurringTopic(topic);
  },
  tasks: async (filters: Record<string, string | boolean | undefined> = {}) => Promise.all(
    (await request<EncryptedTaskResponse[]>(`/api/tasks${query(filters)}`)).map((task) => unprotectTask(task)),
  ),
  taskReferences: async (): Promise<TaskReferences> => {
    const references = await request<{
      topics: EncryptedTopicLabel[];
      meetings: Array<Omit<TaskMeetingReference, 'title'> & EncryptedMeetingTitle>;
    }>('/api/tasks/references');
    return {
      topics: (await Promise.all(
        references.topics.map((topic) => unprotectTopicLabel(topic)),
      ))
        .filter((topic): topic is TaskTopicReference => topic !== null),
      meetings: await Promise.all(references.meetings.map(async (meeting) => ({
        ...meeting,
        title: await unprotectMeetingTitle(meeting.id, meeting.protected),
      }))),
    };
  },
  createTask: async (input: TaskInput) => {
    const encrypted = await protectTaskInput(crypto.randomUUID(), input);
    return unprotectTask(await request<EncryptedTaskResponse>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(encrypted),
    }));
  },
  updateTask: async (id: string, input: Partial<TaskInput>) => unprotectTask(
    await request<EncryptedTaskResponse>(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(await protectTaskPatch(id, input)),
    }),
  ),
};

async function reconcileRecurringTopic(topic: Topic): Promise<void> {
  const plan = await request<RecurrenceReconciliationPlan>(
    `/api/topics/${topic.id}/recurrence-reconciliation`,
  );
  for (const move of plan.moves) {
    await api.addMeetingTopic(move.meetingId, {
      topicId: topic.id,
      sectionId: move.sectionId,
      position: move.position,
      topic,
      source: 'recurrence',
      sourceAppearance: move.sourceAppearance,
    });
  }
  for (const removal of plan.removals) {
    await request<void>(
      `/api/meetings/${removal.meetingId}/topics/${removal.id}/reconciliation`,
      { method: 'DELETE' },
    );
  }
}

async function reconcileAllRecurringTopics(): Promise<void> {
  const topics = await api.topics({ type: 'recurring' });
  for (const topic of topics) await reconcileRecurringTopic(topic);
}

export const formatUser = (user?: User | null): string => user ? `${user.firstName} ${user.lastName}` : translate('common.unassigned');
export const meetingLabel = (meeting: Pick<Meeting, 'title' | 'date'>): string => meeting.title || translate('meetings.defaultTitle', { date: formatDate(`${meeting.date}T12:00:00`) });
export const toLocalDate = (date: Date | null): string | null => {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
