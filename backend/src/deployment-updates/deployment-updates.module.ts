import { Body, Controller, Get, Header, HttpCode, Module, Post } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { DeploymentUpdatesService } from './deployment-updates.service';

class AcknowledgeUpdatesDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('4', { each: true })
  ids!: string[];
}

@Controller('api/deployment-updates')
export class DeploymentUpdatesController {
  constructor(private readonly updates: DeploymentUpdatesService) {}

  @Post('unread')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  unread(@CurrentUser() user: User) {
    return this.updates.unread(user.id);
  }

  @Post('acknowledge')
  @HttpCode(204)
  acknowledge(@CurrentUser() user: User, @Body() input: AcknowledgeUpdatesDto) {
    return this.updates.acknowledge(user.id, input.ids);
  }

  @Get('history')
  @Header('Cache-Control', 'no-store')
  history() {
    return this.updates.history();
  }
}

@Module({
  controllers: [DeploymentUpdatesController],
  providers: [DeploymentUpdatesService],
})
export class DeploymentUpdatesModule {}
