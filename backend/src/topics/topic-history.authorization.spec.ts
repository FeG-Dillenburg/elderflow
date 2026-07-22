import { PERMISSION_CATEGORY_KEY, permissionsByRole } from '../auth/permissions';
import { TopicsController } from './topics.controller';

describe('Topic history authorization', () => {
  it('uses the Topic permission boundary and never exposes Meeting history to a role with hidden Meetings', () => {
    expect(Reflect.getMetadata(PERMISSION_CATEGORY_KEY, TopicsController)).toBe('topics');

    for (const permissions of Object.values(permissionsByRole)) {
      if (permissions.topics !== 'hide') {
        expect(permissions.meetings).not.toBe('hide');
      }
    }
  });
});
