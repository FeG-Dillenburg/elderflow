import { Transform, Type } from 'class-transformer';
import { Equals, IsBase64, IsDefined, IsEmail, IsIn, IsNotEmpty, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { SupportedLanguage, supportedLanguages } from '../../installation/language';

export class SetupPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  setupPassword: string;
}

export class InitialE2eeKeyStateDto {
  @IsUUID()
  organizationId: string;

  @IsUUID()
  orkId: string;

  @IsUUID()
  ockId: string;

  @IsBase64({ urlSafe: true })
  @MaxLength(16_384)
  sharedPassphraseSlot: string;

  @IsBase64({ urlSafe: true })
  @MaxLength(16_384)
  recoverySlot: string;

  @IsBase64({ urlSafe: true })
  @MaxLength(16_384)
  contentKeyWrapper: string;

  @Equals(2)
  custodyCopiesAcknowledged: number;
}

export class CreateInitialUserDto extends SetupPasswordDto {
  @IsIn(supportedLanguages)
  defaultLanguage: SupportedLanguage;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(320)
  email: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => InitialE2eeKeyStateDto)
  e2ee: InitialE2eeKeyStateDto;
}
