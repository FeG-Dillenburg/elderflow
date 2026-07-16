import { describe, expect, it } from 'vitest';
import { roleLabel, userRoleOptions } from './roles';

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
});
