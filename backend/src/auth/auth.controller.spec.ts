import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const service = { login: jest.fn(), present: jest.fn(), updateProfile: jest.fn() };
  const controller = new AuthController(service as any);

  it('delegates login, identity presentation, and profile updates', async () => {
    const user = { id: 'user' } as any;
    const input = { email: 'user@example.com', password: 'password123!' };
    service.login.mockResolvedValue({ token: 'token', user });
    await expect(controller.login(input)).resolves.toEqual({ token: 'token', user });

    service.present.mockReturnValue(user);
    expect(controller.me(user)).toBe(user);

    const profile = { email: 'new@example.com', firstName: 'New', lastName: 'Name' };
    service.updateProfile.mockResolvedValue({ ...user, ...profile });
    await expect(controller.updateProfile(user, profile)).resolves.toEqual({ ...user, ...profile });
  });
});
