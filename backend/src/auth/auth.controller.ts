import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { User } from '../users/user.entity';

@Controller('api')
export class AuthController {
  @Get('me')
  me(@CurrentUser() user: User): User {
    return user;
  }
}
