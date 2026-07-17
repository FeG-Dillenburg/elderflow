import { Logger, Module } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { SetupController } from './setup.controller';
import { SETUP_PASSWORD_HASH, SetupService } from './setup.service';

export const generateSetupPassword = (): string => randomBytes(24).toString('base64url');
export const createSetupPasswordHash = async (rounds = 12): Promise<string> => {
  const setupPassword = generateSetupPassword();
  new Logger(SetupModule.name).log(`Initial setup password: ${setupPassword}`);
  return hash(setupPassword, rounds);
};

@Module({
  controllers: [SetupController],
  providers: [
    { provide: SETUP_PASSWORD_HASH, useFactory: () => createSetupPasswordHash() },
    SetupService,
  ],
})
export class SetupModule {}
