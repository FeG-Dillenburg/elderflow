import { Body, Controller, Get, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { User } from '../users/user.entity';
import { CreateInitialUserDto, SetupPasswordDto } from './dto/setup.dto';
import { SetupService } from './setup.service';

@Controller('api')
@Public()
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('installation')
  installation() {
    return this.setupService.installation();
  }

  @Post('setup/verify')
  verify(@Body() input: SetupPasswordDto): Promise<{ valid: true }> {
    return this.setupService.verifyPassword(input.setupPassword);
  }

  @Post('setup')
  createInitialUser(@Body() input: CreateInitialUserDto): Promise<User> {
    return this.setupService.createInitialUser(input);
  }
}
