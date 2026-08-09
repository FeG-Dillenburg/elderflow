import { SetMetadata } from '@nestjs/common';

export const CEREMONY_ALLOWED_KEY = 'ceremonyAllowed';
export const CeremonyAllowed = () => SetMetadata(CEREMONY_ALLOWED_KEY, true);
