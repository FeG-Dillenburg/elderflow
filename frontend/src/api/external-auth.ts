import { request, type AuthUser } from './domain';

export type ExternalProviderType = 'oidc' | 'churchtools';
export interface PublicExternalProvider { type: ExternalProviderType; displayLabel: string }
export interface ExternalProviderSettings extends PublicExternalProvider {
  id: string;
  issuerUrl: string | null;
  churchToolsUrl: string | null;
  clientId: string | null;
  publicBaseUrl: string | null;
  callbackUrl: string | null;
  clientSecretConfigured: boolean;
  enabled: boolean;
  testedAt: string | null;
  canEnable: boolean;
  status: 'draft' | 'tested-disabled' | 'enabled';
  diagnosticCode: string | null;
}
export interface SaveExternalProviderInput {
  type: ExternalProviderType;
  displayLabel: string;
  issuerUrl?: string | null;
  churchToolsUrl?: string | null;
  clientId?: string | null;
  publicBaseUrl?: string | null;
  clientSecret?: string | null;
  removeClientSecret?: boolean;
}
export interface ExternalLinkedUser { id: string; email: string; firstName: string; lastName: string; linked: boolean }

export const externalAuthApi = {
  publicProvider: () => request<PublicExternalProvider | null>('/api/auth/external/provider'),
  startLogin: (returnPath: string) => request<{ authorizationUrl: string; transactionId: string }>('/api/auth/external/start', { method: 'POST', body: JSON.stringify({ returnPath }) }),
  complete: (code: string) => request<{ token: string; user: AuthUser }>('/api/auth/external/complete', { method: 'POST', body: JSON.stringify({ code }) }),
  settings: () => request<ExternalProviderSettings | null>('/api/auth-settings/provider'),
  save: (input: SaveExternalProviderInput) => request<ExternalProviderSettings>('/api/auth-settings/provider', { method: 'PUT', body: JSON.stringify(input) }),
  remove: () => request<void>('/api/auth-settings/provider', { method: 'DELETE' }),
  startTest: () => request<{ authorizationUrl: string; transactionId: string }>('/api/auth-settings/provider/test', { method: 'POST' }),
  testResult: (id: string) => request<{ pending: boolean; code: string | null }>(`/api/auth-settings/provider/tests/${id}`),
  enable: () => request<ExternalProviderSettings>('/api/auth-settings/provider/enable', { method: 'PATCH' }),
  disable: () => request<ExternalProviderSettings>('/api/auth-settings/provider/disable', { method: 'PATCH' }),
  users: () => request<ExternalLinkedUser[]>('/api/auth-settings/provider/users'),
  resetLink: (userId: string) => request<void>(`/api/auth-settings/provider/users/${userId}/link`, { method: 'DELETE' }),
};
