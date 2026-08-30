import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { Permission } from '../auth/permissions';
import { SaveExternalProviderDto } from './dto/external-auth.dto';
import { ExternalAuthFlowService } from './external-auth-flow.service';
import { ExternalIdentityService } from './external-identity.service';
import { ProviderSettingsService } from './provider-settings.service';

@Controller('api/auth-settings')
@Permission('authSettings')
export class ExternalAuthSettingsController {
  constructor(
    private readonly settings: ProviderSettingsService,
    private readonly flow: ExternalAuthFlowService,
    private readonly identities: ExternalIdentityService,
  ) {}

  @Get('provider') getProvider() { return this.settings.getSettings(); }
  @Put('provider') saveProvider(@Body() input: SaveExternalProviderDto) { return this.settings.save(input); }
  @Delete('provider') removeProvider() { return this.settings.remove(); }
  @Post('provider/test') startTest() { return this.flow.start('test'); }
  @Get('provider/tests/:id') testResult(@Param('id', ParseUUIDPipe) id: string) { return this.flow.testResult(id); }
  @Patch('provider/enable') enable() { return this.settings.setEnabled(true); }
  @Patch('provider/disable') disable() { return this.settings.setEnabled(false); }
  @Get('provider/users') users() { return this.settings.linkedUsers(); }

  @Delete('provider/users/:userId/link')
  async resetLink(@Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    const provider = await this.settings.requireCurrent(false);
    await this.identities.reset(provider.id, userId);
  }
}
