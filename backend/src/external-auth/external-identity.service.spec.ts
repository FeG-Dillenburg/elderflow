import { ExternalIdentityService } from './external-identity.service';

describe('ExternalIdentityService', () => {
  const identities = { findOne: jest.fn(), create: jest.fn((value) => value), save: jest.fn(async (value) => value), delete: jest.fn() };
  const queryBuilder = { where: jest.fn(), andWhere: jest.fn(), getMany: jest.fn() };
  queryBuilder.where.mockReturnValue(queryBuilder);
  queryBuilder.andWhere.mockReturnValue(queryBuilder);
  const users = { createQueryBuilder: jest.fn(() => queryBuilder) };
  const service = new ExternalIdentityService(identities as any, users as any);

  beforeEach(() => jest.clearAllMocks());

  it('links exactly one active User by normalized email without modifying the User', async () => {
    const user = { id: 'user-id', email: 'Ada@Example.com', firstName: 'Ada', role: 'admin', passwordHash: 'local-hash' };
    identities.findOne.mockResolvedValue(null);
    queryBuilder.getMany.mockResolvedValue([user]);

    await expect(service.authenticate('provider-id', { subject: 'stable-subject', email: '  ADA@example.COM ' })).resolves.toBe(user);
    expect(queryBuilder.where).toHaveBeenCalledWith('LOWER(TRIM(user.email)) = :email', { email: 'ada@example.com' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('user.archived_at IS NULL');
    expect(identities.save).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'provider-id', userId: 'user-id', subject: 'stable-subject' }));
    expect(user).toEqual(expect.objectContaining({ email: 'Ada@Example.com', role: 'admin', passwordHash: 'local-hash' }));
  });

  it('uses an existing stable-subject link even when the provider email changes', async () => {
    const user = { id: 'user-id', archivedAt: null };
    identities.findOne.mockResolvedValue({ active: true, user });
    await expect(service.authenticate('provider-id', { subject: 'stable-subject', email: 'changed@example.com' })).resolves.toBe(user);
    expect(users.createQueryBuilder).not.toHaveBeenCalled();
  });

  it.each([[[]], [[{ id: 'one' }, { id: 'two' }]]])('rejects missing or ambiguous matches without provisioning', async (matches) => {
    identities.findOne.mockResolvedValue(null);
    queryBuilder.getMany.mockResolvedValue(matches);
    await expect(service.authenticate('provider-id', { subject: 'subject', email: 'user@example.com' })).rejects.toThrow('External login failed');
    expect(identities.save).not.toHaveBeenCalled();
  });
});
