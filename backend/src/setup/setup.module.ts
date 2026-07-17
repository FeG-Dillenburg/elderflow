import { Module } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { SetupController } from './setup.controller';
import { SETUP_PASSWORD, SetupService } from './setup.service';

export const generateSetupPassword = (): string => randomBytes(24).toString('base64url');

@Module({
  controllers: [SetupController],
  providers: [
    { provide: SETUP_PASSWORD, useFactory: generateSetupPassword },
    SetupService,
  ],
})
export class SetupModule {}
