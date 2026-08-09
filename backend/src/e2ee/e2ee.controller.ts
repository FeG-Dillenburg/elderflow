import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { ApproveRecoveryDto, RegisterClientEpochDto } from './dto/e2ee.dto';
import { E2eeService } from './e2ee.service';
import { AllowRevokedSession } from '../auth/allow-revoked-session.decorator';
import { E2EE_MEDIA_TYPE } from './e2ee-protocol';
import { CurrentSessionId } from '../auth/current-session-id.decorator';
import { CeremonyAllowed } from '../auth/ceremony-allowed.decorator';

@Controller('api/e2ee')
export class E2eeController {
  constructor(private readonly service: E2eeService) {}

  @Get('key-state')
  @CeremonyAllowed()
  @Header('Cache-Control', 'no-store')
  keyState(@CurrentUser() user: User) {
    return this.service.keyState(user);
  }

  @Get('key-state/shared-passphrase-slot')
  @CeremonyAllowed()
  @Header('Cache-Control', 'no-store')
  keyStateSharedSlot(@CurrentUser() user: User, @Res({ passthrough: true }) response: Response): Promise<Buffer> {
    response.setHeader('Content-Type', E2EE_MEDIA_TYPE);
    return this.service.keyWrapper(user, 'shared-passphrase-slot');
  }

  @Get('key-state/content-key-wrapper')
  @CeremonyAllowed()
  @Header('Cache-Control', 'no-store')
  keyStateContentWrapper(@CurrentUser() user: User, @Res({ passthrough: true }) response: Response): Promise<Buffer> {
    response.setHeader('Content-Type', E2EE_MEDIA_TYPE);
    return this.service.keyWrapper(user, 'content-key-wrapper');
  }

  @Get('recovery-metadata')
  @CeremonyAllowed()
  @Header('Cache-Control', 'no-store')
  recoveryMetadata(@CurrentUser() user: User) {
    return this.service.recoveryMetadata(user);
  }

  @Get('recovery-slot')
  @CeremonyAllowed()
  @Header('Cache-Control', 'no-store')
  recoverySlot(@CurrentUser() user: User, @Res({ passthrough: true }) response: Response): Promise<Buffer> {
    response.setHeader('Content-Type', E2EE_MEDIA_TYPE);
    return this.service.recoverySlot(user);
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
  @CeremonyAllowed()
  startRecovery(
    @CurrentUser() user: User,
    @CurrentSessionId() sessionId: string,
    @Headers('x-elderflow-expected-generation') generation: string,
    @Headers('x-elderflow-candidate-fingerprint') candidateFingerprint: string,
    @Body() candidateEnvelope: Buffer,
  ) {
    if (!Buffer.isBuffer(candidateEnvelope)) {
      throw new BadRequestException({ code: 'E2EE_BINARY_BODY_INVALID', message: 'A binary E2EE body is required' });
    }
    return this.service.startRecovery(user, sessionId, {
      expectedGeneration: Number(generation),
      candidateFingerprint,
      candidateSharedPassphraseSlot: candidateEnvelope.toString('base64url'),
    });
  }

  @Post('recovery-ceremonies/:id/approve')
  @CeremonyAllowed()
  approveRecovery(@CurrentUser() user: User, @CurrentSessionId() sessionId: string, @Param('id') id: string, @Body() input: ApproveRecoveryDto) {
    return this.service.approveRecovery(user, sessionId, id, input);
  }

  @Get('recovery-ceremonies/:id')
  @CeremonyAllowed()
  @Header('Cache-Control', 'no-store')
  recoveryCeremony(@CurrentUser() user: User, @Param('id') id: string) {
    return this.service.recoveryCeremony(user, id);
  }

  @Get('recovery-ceremonies/:id/candidate-shared-passphrase-slot')
  @CeremonyAllowed()
  @Header('Cache-Control', 'no-store')
  recoveryCandidate(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Buffer> {
    response.setHeader('Content-Type', E2EE_MEDIA_TYPE);
    return this.service.recoveryCandidate(user, id);
  }

  @Post('recovery-ceremonies/:id/activate')
  @CeremonyAllowed()
  @AllowRevokedSession()
  activateRecovery(@CurrentUser() user: User, @CurrentSessionId() sessionId: string, @Param('id') id: string) {
    return this.service.activateRecovery(user, sessionId, id);
  }

  @Post('recovery-ceremonies/:id/confirm-presence')
  @CeremonyAllowed()
  confirmRecoveryPresence(
    @CurrentUser() user: User,
    @CurrentSessionId() sessionId: string,
    @Param('id') id: string,
  ) {
    return this.service.confirmRecoveryPresence(user, sessionId, id);
  }

  @Post('recovery-ceremonies/:id/abort')
  @CeremonyAllowed()
  @HttpCode(204)
  abortRecovery(@CurrentUser() user: User, @CurrentSessionId() sessionId: string, @Param('id') id: string): Promise<void> {
    return this.service.abortRecovery(user, sessionId, id);
  }
}
