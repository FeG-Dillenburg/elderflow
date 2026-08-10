import { IsBase64, IsInt, IsUUID, MaxLength, Min } from 'class-validator';

export class StartRecoveryDto {
  @IsInt()
  @Min(1)
  expectedGeneration: number;

  @IsBase64({ urlSafe: true })
  @MaxLength(128)
  candidateFingerprint: string;

  @IsBase64({ urlSafe: true })
  @MaxLength(16_384)
  candidateSharedPassphraseSlot: string;
}

export class ApproveRecoveryDto {
  @IsBase64({ urlSafe: true })
  @MaxLength(128)
  candidateFingerprint: string;
}

export class RegisterClientEpochDto {
  @IsUUID()
  id: string;

  @IsBase64({ urlSafe: true })
  @MaxLength(64)
  noncePrefix: string;

  @IsBase64({ urlSafe: true })
  @MaxLength(128)
  signingPublicKey: string;
}
