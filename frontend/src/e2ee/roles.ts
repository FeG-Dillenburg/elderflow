import type { AuthUser, UserRole } from '../api/domain';

export const E2EE_KEY_OPERATOR_ROLES: readonly UserRole[] = ['superadmin', 'admin', 'user'];

export function isE2eeKeyOperator(user: Pick<AuthUser, 'role'> | null): boolean {
  return Boolean(user && E2EE_KEY_OPERATOR_ROLES.includes(user.role));
}
