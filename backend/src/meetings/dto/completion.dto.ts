import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsInt, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from "class-validator";

export class CompletionPrepareDto {
  @IsString()
  @MaxLength(1_400_000)
  proofEnvelope: string;
}
export class MentionSubmissionDto {
  @IsUUID()
  id: string;
  @IsUUID()
  userId: string;
  @IsInt()
  @Min(0)
  occurrence: number;
  @IsString()
  @MaxLength(1_400_000)
  contextEnvelope: string;
}
export class AppearanceMentionsDto {
  @IsUUID()
  appearanceId: string;
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => MentionSubmissionDto)
  mentions: MentionSubmissionDto[];
}
export class CompletionSubmissionDto extends CompletionPrepareDto {
  @IsUUID()
  barrierId: string;
  @IsUUID()
  documentId: string;
  @IsString()
  @Matches(/^(0|[1-9][0-9]*)$/)
  @MaxLength(20)
  serverSequence: string;
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => AppearanceMentionsDto)
  appearances: AppearanceMentionsDto[];
}
