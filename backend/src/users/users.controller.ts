import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './user.entity';
import { UsersService } from './users.service';

@Controller('api')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Post('user')
  create(@Body() input: CreateUserDto): Promise<User> {
    return this.usersService.create(input);
  }
}

