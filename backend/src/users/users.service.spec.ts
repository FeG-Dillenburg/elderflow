import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let repository: jest.Mocked<Pick<Repository<User>, 'create' | 'find' | 'save'>>;

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repository },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('returns users ordered by newest first', async () => {
    const users = [{ id: 'user-id', email: 'alex@example.com' }] as User[];
    repository.find.mockResolvedValue(users);

    await expect(service.findAll()).resolves.toEqual(users);
    expect(repository.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
  });

  it('creates and saves a user', async () => {
    const input = { email: 'alex@example.com', firstName: 'Alex', lastName: 'Smith' };
    const user = { id: 'user-id', ...input } as User;
    repository.create.mockReturnValue(user);
    repository.save.mockResolvedValue(user);

    await expect(service.create(input)).resolves.toEqual(user);
    expect(repository.create).toHaveBeenCalledWith(input);
    expect(repository.save).toHaveBeenCalledWith(user);
  });
});

