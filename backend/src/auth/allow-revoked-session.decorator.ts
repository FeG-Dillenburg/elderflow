import { SetMetadata } from '@nestjs/common';

export const ALLOW_REVOKED_SESSION_KEY = 'allowRevokedSession';
export const AllowRevokedSession = () => SetMetadata(ALLOW_REVOKED_SESSION_KEY, true);
