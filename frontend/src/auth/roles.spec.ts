import { describe, expect, it } from 'vitest';
import { assignableUsers, isAssignableUser, roleLabel, userRoleOptions } from './roles';

describe('role presentation', () => {
  it('provides one consistent label source for every role', () => {
    expect(userRoleOptions.map(({ value, label }) => [value, label])).toEqual([
      ['superadmin', 'Superadmin'],
      ['it-admin', 'IT admin'],
      ['admin', 'Admin'],
      ['user', 'User'],
      ['guest', 'Guest'],
    ]);
    for (const option of userRoleOptions) expect(roleLabel(option.value)).toBe(option.label);
  });

  it('excludes IT admins from content assignment choices', () => {
    const users = [
      { id: 'admin', role: 'admin' as const },
      { id: 'it-admin', role: 'it-admin' as const },
      { id: 'user', role: 'user' as const },
    ];
    expect(assignableUsers(users).map((user) => user.id)).toEqual(['admin', 'user']);
    expect(isAssignableUser(users[1])).toBe(false);
  });
});
