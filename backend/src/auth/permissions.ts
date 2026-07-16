import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../users/user.entity';

export type PermissionLevel = 'manage' | 'view' | 'hide';
export type PermissionCategory = 'dashboard' | 'users' | 'meetings' | 'topics' | 'tasks' | 'contentSettings' | 'authSettings';
export type UserPermissions = Record<PermissionCategory, PermissionLevel>;

export const PERMISSION_CATEGORY_KEY = 'permissionCategory';
export const Permission = (category: PermissionCategory): ClassDecorator & MethodDecorator =>
  SetMetadata(PERMISSION_CATEGORY_KEY, category);

const contentManager: UserPermissions = {
  dashboard: 'view',
  users: 'manage',
  meetings: 'manage',
  topics: 'manage',
  tasks: 'manage',
  contentSettings: 'manage',
  authSettings: 'hide',
};

export const permissionsByRole: Record<UserRole, UserPermissions> = {
  superadmin: {
    dashboard: 'manage',
    users: 'manage',
    meetings: 'manage',
    topics: 'manage',
    tasks: 'manage',
    contentSettings: 'manage',
    authSettings: 'manage',
  },
  'it-admin': {
    dashboard: 'hide',
    users: 'manage',
    meetings: 'hide',
    topics: 'hide',
    tasks: 'hide',
    contentSettings: 'hide',
    authSettings: 'manage',
  },
  admin: contentManager,
  user: {
    dashboard: 'view',
    users: 'view',
    meetings: 'manage',
    topics: 'manage',
    tasks: 'manage',
    contentSettings: 'view',
    authSettings: 'hide',
  },
  guest: {
    dashboard: 'view',
    users: 'view',
    meetings: 'view',
    topics: 'view',
    tasks: 'view',
    contentSettings: 'hide',
    authSettings: 'hide',
  },
};
