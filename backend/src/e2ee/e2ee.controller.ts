import { Body, Controller, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { ApproveRecoveryDto, RegisterClientEpochDto, StartRecoveryDto } from './dto/e2ee.dto';
import { E2eeService } from './e2ee.service';

@Controller('api/e2ee')
export class E2eeController {
  constructor(private readonly service: E2eeService) {}

  @Get('key-state')
  @Header('Cache-Control', 'no-store')
  keyState(@CurrentUser() user: User) {
    return this.service.keyState(user);
  }

  @Get('recovery-metadata')
  @Header('Cache-Control', 'no-store')
  recoveryMetadata(@CurrentUser() user: User) {
    return this.service.recoveryMetadata(user);
  }

  @Post('client-epochs')
  registerClientEpoch(@CurrentUser() user: User, @Body() input: RegisterClientEpochDto) {
    return this.service.registerClientEpoch(user, input);
  }

  @Post('client-epochs/:id/revoke')
  @HttpCode(204)
  revokeClientEpoch(@CurrentUser() user: User, @Param('id') id: string): Promise<void> {
    return this.service.revokeClientEpoch(user, id);
  }

  @Post('recovery-ceremonies')
  startRecovery(@CurrentUser() user: User, @Body() input: StartRecoveryDto) {
    return this.service.startRecovery(user, input);
  }

  @Post('recovery-ceremonies/:id/approve')
  approveRecovery(@CurrentUser() user: User, @Param('id') id: string, @Body() input: ApproveRecoveryDto) {
    return this.service.approveRecovery(user, id, input);
  }

  @Get('recovery-ceremonies/:id')
  @Header('Cache-Control', 'no-store')
  recoveryCeremony(@CurrentUser() user: User, @Param('id') id: string) {
    return this.service.recoveryCeremony(user, id);
  }

  @Post('recovery-ceremonies/:id/activate')
  activateRecovery(@CurrentUser() user: User, @Param('id') id: string) {
    return this.service.activateRecovery(user, id);
  }

  @Post('recovery-ceremonies/:id/abort')
  @HttpCode(204)
  abortRecovery(@CurrentUser() user: User, @Param('id') id: string): Promise<void> {
    return this.service.abortRecovery(user, id);
  }
}
