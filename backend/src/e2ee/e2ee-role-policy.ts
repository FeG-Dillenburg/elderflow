import { User } from '../users/user.entity';

export const E2EE_KEY_OPERATOR_ROLES: readonly User['role'][] = ['superadmin', 'admin', 'user'];

export function isE2eeKeyOperator(role: User['role']): boolean {
  return E2EE_KEY_OPERATOR_ROLES.includes(role);
}
