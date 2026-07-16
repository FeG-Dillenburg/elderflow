export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export type UserRole = 'superadmin' | 'it-admin' | 'admin' | 'user' | 'guest';
export type PermissionLevel = 'manage' | 'view' | 'hide';
export type PermissionCategory = 'dashboard' | 'users' | 'meetings' | 'topics' | 'tasks' | 'contentSettings' | 'authSettings';
export type UserPermissions = Record<PermissionCategory, PermissionLevel>;
export interface AuthUser extends User { permissions: UserPermissions }

export interface AgendaSection {
  id: string;
  name: string;
  position: number;
  isDefault: boolean;
}

export interface Topic {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  followUpDate: string | null;
  responsibleUserId: string | null;
  responsibleUser?: User | null;
  isRecurring: boolean;
  defaultSectionId: string | null;
  defaultSection?: AgendaSection | null;
  defaultPosition: number | null;
  createdAt: string;
  updatedAt: string;
  updates?: TopicUpdate[];
  tasks?: Task[];
}

export interface TopicInput {
  name: string;
  description: string;
  type: string;
  status: string;
  followUpDate: string | null;
  responsibleUserId: string | null;
  isRecurring: boolean;
  defaultSectionId: string | null;
  defaultPosition: number | null;
}

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

export interface MeetingTopic {
  id: string;
  meetingId: string;
  topicId: string;
  sectionId: string;
  section?: AgendaSection;
  topic?: Topic;
  position: number;
  agendaNote: string | null;
  plannedDuration: number | null;
  status: string;
  meeting?: Meeting;
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
    const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message;
    throw new Error(message || 'The request could not be completed');
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
  login: (input: { email: string; password: string }) => request<{ token: string; user: AuthUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  me: () => request<AuthUser>('/api/auth/me'),
  updateProfile: (input: { email: string; firstName: string; lastName: string; password?: string }) => request<AuthUser>('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(input) }),
  users: () => request<User[]>('/api/users'),
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
  addTopicUpdate: (id: string, input: { text: string; type: string; meetingId?: string | null }) => request<TopicUpdate>(`/api/topics/${id}/updates`, { method: 'POST', body: JSON.stringify(input) }),
  topicAppearances: (id: string) => request<MeetingTopic[]>(`/api/topics/${id}/appearances`),
  meetings: () => request<Meeting[]>('/api/meetings'),
  meeting: (id: string) => request<Meeting>(`/api/meetings/${id}`),
  createMeeting: (input: MeetingInput) => request<Meeting>('/api/meetings', { method: 'POST', body: JSON.stringify(input) }),
  updateMeeting: (id: string, input: MeetingInput) => request<Meeting>(`/api/meetings/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  meetingSuggestions: (id: string) => request<Topic[]>(`/api/meetings/${id}/suggestions`),
  addParticipant: (meetingId: string, input: { userId: string; attendanceStatus: string }) => request<MeetingParticipant>(`/api/meetings/${meetingId}/participants`, { method: 'POST', body: JSON.stringify(input) }),
  removeParticipant: (meetingId: string, userId: string) => request<void>(`/api/meetings/${meetingId}/participants/${userId}`, { method: 'DELETE' }),
  addMeetingTopic: (meetingId: string, input: { topicId: string; sectionId: string; position?: number }) => request<MeetingTopic>(`/api/meetings/${meetingId}/topics`, { method: 'POST', body: JSON.stringify(input) }),
  reorderMeetingTopics: (meetingId: string, items: Array<{ id: string; sectionId: string; position: number }>) => request<MeetingTopic[]>(`/api/meetings/${meetingId}/topics/order`, { method: 'PUT', body: JSON.stringify({ items }) }),
  updateMeetingTopic: (meetingId: string, item: MeetingTopic) => request<MeetingTopic>(`/api/meetings/${meetingId}/topics/${item.id}`, { method: 'PUT', body: JSON.stringify({ sectionId: item.sectionId, position: item.position, agendaNote: item.agendaNote, plannedDuration: item.plannedDuration, status: item.status }) }),
  removeMeetingTopic: (meetingId: string, itemId: string) => request<void>(`/api/meetings/${meetingId}/topics/${itemId}`, { method: 'DELETE' }),
  tasks: (filters: Record<string, string | boolean | undefined> = {}) => request<Task[]>(`/api/tasks${query(filters)}`),
  createTask: (input: TaskInput) => request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(input) }),
  updateTask: (id: string, input: TaskInput) => request<Task>(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
};

export const formatUser = (user?: User | null): string => user ? `${user.firstName} ${user.lastName}` : 'Unassigned';
export const meetingLabel = (meeting: Pick<Meeting, 'title' | 'date'>): string => meeting.title || `Leadership meeting - ${new Date(`${meeting.date}T12:00:00`).toLocaleDateString()}`;
export const toLocalDate = (date: Date | null): string | null => {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
