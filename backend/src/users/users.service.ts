import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, QueryFailedError, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/create-user.dto';
import { User } from './user.entity';
import { hash } from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(includeArchived = false): Promise<User[]> {
    return this.usersRepository.find({
      ...(includeArchived ? {} : { where: { archivedAt: IsNull() } }),
      order: { createdAt: 'DESC' },
    });
  }

  async create(input: CreateUserDto): Promise<User> {
    const { password, ...fields } = input;
    const user = this.usersRepository.create({ ...fields, passwordHash: await hash(password, 12) });
    try {
      return this.withoutPassword(await this.usersRepository.save(user));
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateUserDto): Promise<User> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    const { password, ...fields } = input;
    Object.assign(user, fields);
    if (password) user.passwordHash = await hash(password, 12);
    try {
      return this.withoutPassword(await this.usersRepository.save(user));
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<{ action: 'deleted' | 'archived' }> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('User not found');

      const [result] = await manager.query(
        `SELECT EXISTS (
          SELECT 1 FROM "topics" WHERE "responsible_user_id" = $1
          UNION ALL SELECT 1 FROM "meetings" WHERE "meeting_leader_id" = $1 OR "minute_taker_id" = $1
          UNION ALL SELECT 1 FROM "meeting_users" WHERE "user_id" = $1
          UNION ALL SELECT 1 FROM "topic_updates" WHERE "created_by_id" = $1
          UNION ALL SELECT 1 FROM "tasks" WHERE "assigned_to_id" = $1
        ) AS "referenced"`,
        [id],
      ) as Array<{ referenced: boolean }>;

      if (result?.referenced) {
        user.archivedAt = new Date();
        await manager.save(User, user);
        return { action: 'archived' };
      }

      await manager.delete(User, id);
      return { action: 'deleted' };
    });
  }

  async restore(id: string): Promise<User> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    user.archivedAt = null;
    return this.usersRepository.save(user);
  }

  private withoutPassword(user: User): User {
    delete (user as Partial<User>).passwordHash;
    return user;
  }
}
