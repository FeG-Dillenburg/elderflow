import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

export class MeetingDto {
  @IsOptional() @IsString() title?: string | null;
  @IsString() @IsNotEmpty() date: string;
  @IsString() @IsNotEmpty() beginTime: string;
  @IsIn(['planned', 'in_progress', 'completed']) status: string;
  @IsOptional() @IsUUID() meetingLeaderId?: string | null;
  @IsOptional() @IsUUID() minuteTakerId?: string | null;
  @IsOptional() @IsString() generalNotes?: string | null;
  @IsOptional() @IsString() openingInput?: string | null;
}

export class MeetingParticipantDto {
  @IsUUID() userId: string;
  @IsIn(['present', 'absent', 'excused', 'unknown']) attendanceStatus: string;
}

export class MeetingTopicDto {
  @IsUUID() topicId: string;
  @IsUUID() sectionId: string;
  @IsOptional() @IsInt() @Min(1) position?: number;
  @IsOptional() @IsString() agendaNote?: string | null;
  @IsOptional() @IsInt() @Min(1) plannedDuration?: number | null;
}

export class UpdateMeetingTopicDto {
  @IsUUID() sectionId: string;
  @IsInt() @Min(1) position: number;
  @IsOptional() @IsString() agendaNote?: string | null;
  @IsOptional() @IsInt() @Min(1) plannedDuration?: number | null;
  @IsIn(['planned', 'discussed', 'skipped', 'moved', 'done']) status: string;
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
