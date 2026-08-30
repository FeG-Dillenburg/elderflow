import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { CompleteExternalLoginDto, StartExternalLoginDto } from './dto/external-auth.dto';
import { ExternalAuthFlowService } from './external-auth-flow.service';
import { ProviderSettingsService } from './provider-settings.service';

@Controller('api/auth/external')
export class ExternalAuthController {
  constructor(private readonly flow: ExternalAuthFlowService, private readonly settings: ProviderSettingsService) {}

  @Get('provider')
  @Public()
  provider() { return this.settings.getPublicProvider(); }

  @Post('start')
  @Public()
  start(@Body() input: StartExternalLoginDto) { return this.flow.start('login', input.returnPath); }

  @Get('callback')
  @Public()
  async callback(
    @Query('state') state: string | undefined,
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    response.redirect(303, await this.flow.callback(state, code, error));
  }

  @Post('complete')
  @Public()
  complete(@Body() input: CompleteExternalLoginDto) { return this.flow.complete(input.code); }
}
