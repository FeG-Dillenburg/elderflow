import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

export class MeetingEncryptedScalarsDto {
  @IsString() @IsNotEmpty() titleEnvelope: string;
}

export class MeetingEncryptedScalarPatchDto {
  @IsOptional() @IsString() @IsNotEmpty() titleEnvelope?: string;
}

export class InitialMeetingDocumentDto {
  @IsUUID() documentId: string;
  @IsUUID() snapshotId: string;
  @IsString() @IsNotEmpty() snapshotEnvelope: string;
}

export class MeetingDto {
  @IsUUID() id: string;
  @IsDefined() @ValidateNested() @Type(() => MeetingEncryptedScalarsDto)
  protected: MeetingEncryptedScalarsDto;
  @IsDefined() @ValidateNested() @Type(() => InitialMeetingDocumentDto)
  document: InitialMeetingDocumentDto;
  @IsString() @IsNotEmpty() date: string;
  @IsString() @IsNotEmpty() beginTime: string;
  @IsIn(["planned", "in_progress"]) status: string;
  @IsOptional() @IsUUID() meetingLeaderId?: string | null;
  @IsOptional() @IsUUID() minuteTakerId?: string | null;
}

export class MeetingUpdateDto {
  @IsOptional() @ValidateNested() @Type(() => MeetingEncryptedScalarPatchDto)
  protected?: MeetingEncryptedScalarPatchDto;
  @IsOptional() @IsString() @IsNotEmpty() date?: string;
  @IsOptional() @IsString() @IsNotEmpty() beginTime?: string;
  @IsOptional() @IsIn(["planned", "in_progress"]) status?: string;
  @IsOptional() @IsUUID() meetingLeaderId?: string | null;
  @IsOptional() @IsUUID() minuteTakerId?: string | null;
}

export class MeetingParticipantDto {
  @IsUUID() userId: string;
  @IsIn(["present", "absent", "excused", "unknown"]) attendanceStatus: string;
}

export class MeetingTopicDto {
  @IsUUID() id: string;
  @IsUUID() mutationId: string;
  @IsUUID() topicId: string;
  @IsUUID() sectionId: string;
  @IsString() @IsNotEmpty() initialUpdateEnvelope: string;
  @IsOptional() @IsUUID() sourceAppearanceId?: string;
  @IsOptional() @IsIn(["manual", "recurrence"]) source?: "manual" | "recurrence";
  @IsOptional() @IsInt() @Min(1) position?: number;
  @IsOptional() @IsInt() @Min(1) plannedDuration?: number | null;
}

export class MeetingDocumentUpdateDto {
  @IsString() @IsNotEmpty() envelope: string;
  @IsOptional() @IsUUID() appearanceId?: string;
}

export class UpdateMeetingTopicDto {
  @IsUUID() sectionId: string;
  @IsInt() @Min(1) position: number;
  @IsOptional() @IsInt() @Min(1) plannedDuration?: number | null;
  @IsIn(["planned", "discussed", "skipped", "moved", "done"]) status: string;
  @IsOptional() @IsBoolean() deferred?: boolean;
}

export class MeetingTopicOrderItemDto {
  @IsUUID() id: string;
  @IsUUID() sectionId: string;
  @IsInt() @Min(1) position: number;
}

export class ReorderMeetingTopicsDto {
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => MeetingTopicOrderItemDto)
  items: MeetingTopicOrderItemDto[];
}
