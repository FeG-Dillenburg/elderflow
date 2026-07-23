import type { SupportedLanguage } from '../i18n/language';
import { localizeApiError, type ApiErrorPayload } from '../i18n/api-errors';
import { formatDate, translate } from '../i18n';
import type { TopicType } from '../topics/topicTypes';
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

export type TopicFieldPatch = Partial<Pick<
  Topic,
  'responsibleUserId' | 'membershipProcessStatus' | 'membershipStatusSignal' | 'godparents'
>>;

export interface DashboardData {
  nextMeeting: Meeting | null;
  myOpenTasks: Task[];
  overdueTasks: Task[];
  followUpTopics: Topic[];
  recentTopics: Topic[];
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
import { getSessionToken } from '../auth/session';

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getSessionToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
    throw new Error(localizeApiError(payload, translate));
  }
  if (response.status === 204 || response.headers?.get('content-length') === '0') return undefined as T;
  return response.json() as Promise<T>;
}

const query = (values: Record<string, string | boolean | null | undefined>): string => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const result = params.toString();
  return result ? `?${result}` : '';
};

export const api = {
  installation: () => request<{ setupRequired: boolean; defaultLanguage: SupportedLanguage | null }>('/api/installation'),
  verifySetupPassword: (setupPassword: string) => request<{ valid: true }>('/api/setup/verify', { method: 'POST', body: JSON.stringify({ setupPassword }) }),
  createInitialUser: (input: InitialUserInput) => request<User>('/api/setup', { method: 'POST', body: JSON.stringify(input) }),
  login: (input: { email: string; password: string }) => request<{ token: string; user: AuthUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  me: () => request<AuthUser>('/api/auth/me'),
  updateProfile: (input: { email: string; firstName: string; lastName: string; language: SupportedLanguage | null; password?: string }) => request<AuthUser>('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(input) }),
  users: () => request<User[]>('/api/users'),
  userDirectory: () => request<User[]>('/api/user-directory'),
  dashboard: () => request<DashboardData>('/api/dashboard'),
  sections: () => request<AgendaSection[]>('/api/agenda-sections'),
  createSection: (input: Omit<AgendaSection, 'id'>) => request<AgendaSection>('/api/agenda-sections', { method: 'POST', body: JSON.stringify(input) }),
  updateSection: (id: string, input: Omit<AgendaSection, 'id'>) => request<AgendaSection>(`/api/agenda-sections/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteSection: (id: string) => request<void>(`/api/agenda-sections/${id}`, { method: 'DELETE' }),
  topics: (filters: Record<string, string | undefined> = {}) => request<Topic[]>(`/api/topics${query(filters)}`),
  topic: (id: string) => request<Topic>(`/api/topics/${id}`),
  createTopic: (input: TopicInput) => request<Topic>('/api/topics', { method: 'POST', body: JSON.stringify(input) }),
  updateTopic: (id: string, input: TopicInput) => request<Topic>(`/api/topics/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  topicUpdates: (id: string) => request<TopicUpdate[]>(`/api/topics/${id}/updates`),
  topicHistory: (id: string) => request<TopicHistoryEntry[]>(`/api/topics/${id}/history`),
  addTopicUpdate: (id: string, input: { text: string; type: string; meetingId?: string | null }) => request<TopicUpdate>(`/api/topics/${id}/updates`, { method: 'POST', body: JSON.stringify(input) }),
  topicAppearances: (id: string) => request<MeetingTopic[]>(`/api/topics/${id}/appearances`),
  skippedRecurrences: (id: string) => request<SkippedRecurrence[]>(`/api/topics/${id}/skipped-recurrences`),
  meetings: () => request<Meeting[]>('/api/meetings'),
  meeting: (id: string) => request<Meeting>(`/api/meetings/${id}`),
  createMeeting: (input: MeetingInput) => request<Meeting>('/api/meetings', { method: 'POST', body: JSON.stringify(input) }),
  updateMeeting: (id: string, input: MeetingInput) => request<Meeting>(`/api/meetings/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  completeMeeting: (id: string) => request<Meeting>(`/api/meetings/${id}/complete`, { method: 'POST' }),
  meetingSuggestions: (id: string) => request<Topic[]>(`/api/meetings/${id}/suggestions`),
  addParticipant: (meetingId: string, input: { userId: string; attendanceStatus: string }) => request<MeetingParticipant>(`/api/meetings/${meetingId}/participants`, { method: 'POST', body: JSON.stringify(input) }),
  removeParticipant: (meetingId: string, userId: string) => request<void>(`/api/meetings/${meetingId}/participants/${userId}`, { method: 'DELETE' }),
  addMeetingTopic: (meetingId: string, input: { topicId: string; sectionId: string; position?: number }) => request<MeetingTopic>(`/api/meetings/${meetingId}/topics`, { method: 'POST', body: JSON.stringify(input) }),
  reorderMeetingTopics: (meetingId: string, items: Array<{ id: string; sectionId: string; position: number }>) => request<MeetingTopic[]>(`/api/meetings/${meetingId}/topics/order`, { method: 'PUT', body: JSON.stringify({ items }) }),
  updateMeetingTopic: (meetingId: string, item: MeetingTopic, options?: { deferred?: boolean }) => request<MeetingTopic>(`/api/meetings/${meetingId}/topics/${item.id}`, { method: 'PUT', body: JSON.stringify({ sectionId: item.sectionId, position: item.position, plannedDuration: item.plannedDuration, status: item.status, deferred: options?.deferred }) }),
  updateMeetingTopicFields: (meetingId: string, itemId: string, input: TopicFieldPatch) => request<Topic>(`/api/meetings/${meetingId}/topics/${itemId}/fields`, { method: 'PUT', body: JSON.stringify(input) }),
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
  tasks: (filters: Record<string, string | boolean | undefined> = {}) => request<Task[]>(`/api/tasks${query(filters)}`),
  createTask: (input: TaskInput) => request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(input) }),
  updateTask: (id: string, input: TaskInput) => request<Task>(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
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
