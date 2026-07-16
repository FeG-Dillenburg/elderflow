import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './user.entity';
import { UsersService } from './users.service';

@Controller('api')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  findAll(@Query('includeArchived') includeArchived?: string): Promise<User[]> {
    return this.usersService.findAll(includeArchived === 'true');
  }

  @Post('user')
  create(@Body() input: CreateUserDto): Promise<User> {
    return this.usersService.create(input);
  }

  @Delete('users/:id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ action: 'deleted' | 'archived' }> {
    return this.usersService.remove(id);
  }

  @Patch('users/:id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<User> {
    return this.usersService.restore(id);
  }
}
