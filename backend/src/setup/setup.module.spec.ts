import { Logger } from '@nestjs/common';
import { compare } from 'bcryptjs';
import { createSetupPasswordHash } from './setup.module';

describe('SetupModule', () => {
  it('logs a random startup password while retaining only its bcrypt hash', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const setupPasswordHash = await createSetupPasswordHash(4);
    const message = log.mock.calls[0]?.[0];
    const setupPassword = typeof message === 'string' ? message.replace('Initial setup password: ', '') : '';

    expect(message).toMatch(/^Initial setup password: [A-Za-z0-9_-]{32}$/);
    await expect(compare(setupPassword, setupPasswordHash)).resolves.toBe(true);
    expect(setupPasswordHash).toMatch(/^\$2[aby]\$/);
    log.mockRestore();
  });
});
