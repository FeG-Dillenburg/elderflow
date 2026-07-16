export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  archivedAt: string | null;
}

export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message;
    throw new Error(message || 'The request could not be completed');
  }

  return response.json() as Promise<T>;
}

export function getUsers(includeArchived = false): Promise<User[]> {
  return apiRequest<User[]>(includeArchived ? '/api/users?includeArchived=true' : '/api/users');
}

export function createUser(input: CreateUserInput): Promise<User> {
  return apiRequest<User>('/api/user', {
    method: 'POST',
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
