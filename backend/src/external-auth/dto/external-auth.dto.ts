import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { externalProviderTypes, ExternalProviderType } from '../external-auth-provider.entity';

export class SaveExternalProviderDto {
  @IsIn(externalProviderTypes) type: ExternalProviderType;
  @IsString() @MinLength(1) @MaxLength(80) displayLabel: string;
  @ValidateIf((input: SaveExternalProviderDto) => input.type === 'oidc') @IsOptional() @IsUrl({ require_tld: false }) issuerUrl?: string | null;
  @ValidateIf((input: SaveExternalProviderDto) => input.type === 'churchtools') @IsOptional() @IsUrl({ require_tld: false }) churchToolsUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(500) clientId?: string | null;
  @IsOptional() @IsUrl({ require_tld: false }) publicBaseUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) clientSecret?: string | null;
  @IsOptional() @IsBoolean() removeClientSecret?: boolean;
}

export class StartExternalLoginDto {
  @IsOptional() @IsString() @MaxLength(2000) returnPath?: string;
}

export class CompleteExternalLoginDto {
  @IsString() @MinLength(32) @MaxLength(500) code: string;
}
