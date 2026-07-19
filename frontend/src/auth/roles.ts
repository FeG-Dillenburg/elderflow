import type { UserRole } from '../api/domain';
import { translate } from '../i18n';

const roleOrder: UserRole[] = ['superadmin', 'it-admin', 'admin', 'user', 'guest'];

export const userRoleOptions = roleOrder.map((value) => ({
  value,
  get label() { return roleLabel(value); },
}));

export const roleLabel = (role: UserRole | undefined): string => role ? translate(`roles.${role}`) : '';

export const isAssignableUser = (user: { role: UserRole }): boolean => user.role !== 'it-admin';

export const assignableUsers = <T extends { role: UserRole }>(users: T[]): T[] => users.filter(isAssignableUser);
