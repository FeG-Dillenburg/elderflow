import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { SetupController } from './setup.controller';

describe('SetupController', () => {
  it('exposes public status, password verification, and initial-user creation endpoints', async () => {
    const service = {
      installation: jest.fn().mockResolvedValue({ setupRequired: true, defaultLanguage: null }),
      verifyPassword: jest.fn().mockResolvedValue({ valid: true }),
      createInitialUser: jest.fn().mockResolvedValue({ id: 'user-id', role: 'superadmin' }),
    };
    const controller = new SetupController(service as any);
    const input = {
      setupPassword: 'setup-password', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', password: 'password123!',
      defaultLanguage: 'en' as const,
      e2ee: {
        organizationId: '00000000-0000-4000-8000-000000000001',
        orkId: '00000000-0000-4000-8000-000000000003',
        ockId: '00000000-0000-4000-8000-000000000004',
        sharedPassphraseSlot: Buffer.alloc(96).toString('base64url'),
        recoverySlot: Buffer.alloc(96).toString('base64url'),
        contentKeyWrapper: Buffer.alloc(96).toString('base64url'),
        custodyCopiesAcknowledged: 2 as const,
      },
    };

    await expect(controller.installation()).resolves.toEqual({ setupRequired: true, defaultLanguage: null });
    await expect(controller.verify({ setupPassword: input.setupPassword })).resolves.toEqual({ valid: true });
    await expect(controller.createInitialUser(input)).resolves.toEqual({ id: 'user-id', role: 'superadmin' });
    expect(service.verifyPassword).toHaveBeenCalledWith(input.setupPassword);
    expect(service.createInitialUser).toHaveBeenCalledWith(input);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, SetupController)).toBe(true);
  });
});
