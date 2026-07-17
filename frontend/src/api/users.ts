export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  archivedAt: string | null;
  role: import('./domain').UserRole;
}

export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  role: import('./domain').UserRole;
  password: string;
}
import { request as apiRequest } from './domain';

export function getUsers(includeArchived = false): Promise<User[]> {
  return apiRequest<User[]>(includeArchived ? '/api/users?includeArchived=true' : '/api/users');
}

export function createUser(input: CreateUserInput): Promise<User> {
  return apiRequest<User>('/api/user', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateUser(id: string, input: Partial<CreateUserInput>): Promise<User> {
  return apiRequest<User>(`/api/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function removeUser(id: string): Promise<{ action: 'deleted' | 'archived' }> {
  return apiRequest<{ action: 'deleted' | 'archived' }>(`/api/users/${id}`, {
    method: 'DELETE',
  });
}

export function restoreUser(id: string): Promise<User> {
  return apiRequest<User>(`/api/users/${id}/restore`, {
    method: 'PATCH',
  });
}
