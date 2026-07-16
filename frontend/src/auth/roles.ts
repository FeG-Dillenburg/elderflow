import type { UserRole } from '../api/domain';

const roleLabels: Record<UserRole, string> = {
  superadmin: 'Superadmin',
  'it-admin': 'IT admin',
  admin: 'Admin',
  user: 'User',
  guest: 'Guest',
};

const roleOrder: UserRole[] = ['superadmin', 'it-admin', 'admin', 'user', 'guest'];

export const userRoleOptions = roleOrder.map((value) => ({
  value,
  label: roleLabels[value],
}));

export const roleLabel = (role: UserRole): string => roleLabels[role];
