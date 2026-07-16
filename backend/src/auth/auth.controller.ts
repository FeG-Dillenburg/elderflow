import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { User } from '../users/user.entity';
import { Public } from './public.decorator';
import { AuthService, AuthUser } from './auth.service';
import { LoginDto, UpdateProfileDto } from './dto/auth.dto';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('login')
  @Public()
  login(@Body() input: LoginDto): Promise<{ token: string; user: AuthUser }> {
    return this.service.login(input);
  }

  @Get('me')
  me(@CurrentUser() user: User): AuthUser {
    return this.service.present(user);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: User, @Body() input: UpdateProfileDto): Promise<AuthUser> {
    return this.service.updateProfile(user, input);
  }
}
