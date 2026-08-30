import { Injectable } from '@nestjs/common';
import { ExternalAuthProvider } from './external-auth-provider.entity';
import { ChurchToolsAdapter } from './adapters/churchtools.adapter';
import { OidcAdapter } from './adapters/oidc.adapter';
import { ProviderAdapter } from './adapters/provider-adapter';

@Injectable()
export class ProviderRegistryService {
  constructor(private readonly oidc: OidcAdapter, private readonly churchTools: ChurchToolsAdapter) {}
  for(provider: ExternalAuthProvider): ProviderAdapter { return provider.type === 'oidc' ? this.oidc : this.churchTools; }
}
