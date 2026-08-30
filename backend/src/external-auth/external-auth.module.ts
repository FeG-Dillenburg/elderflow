import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../users/user.entity';
import { ChurchToolsAdapter } from './adapters/churchtools.adapter';
import { OidcAdapter } from './adapters/oidc.adapter';
import { ExternalAuthController } from './external-auth.controller';
import { ExternalAuthFlowService } from './external-auth-flow.service';
import { ExternalAuthProvider } from './external-auth-provider.entity';
import { ExternalAuthSettingsController } from './external-auth-settings.controller';
import { ExternalIdentity } from './external-identity.entity';
import { ExternalIdentityService } from './external-identity.service';
import { ExternalLoginTransaction } from './external-login-transaction.entity';
import { ProviderHttpService } from './provider-http.service';
import { ProviderRegistryService } from './provider-registry.service';
import { ProviderSecretService } from './provider-secret.service';
import { ProviderSettingsService } from './provider-settings.service';
import { ProviderUrlService } from './provider-url.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([ExternalAuthProvider, ExternalIdentity, ExternalLoginTransaction, User])],
  controllers: [ExternalAuthController, ExternalAuthSettingsController],
  providers: [
    ExternalAuthFlowService,
    ExternalIdentityService,
    ProviderSettingsService,
    ProviderRegistryService,
    ProviderSecretService,
    ProviderUrlService,
    ProviderHttpService,
    OidcAdapter,
    ChurchToolsAdapter,
  ],
})
export class ExternalAuthModule {}
