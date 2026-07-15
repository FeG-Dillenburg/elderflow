import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { TOPIC_STATUSES, TOPIC_TYPES } from '../topic.entity';

export class TopicDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() description: string;
  @IsIn(TOPIC_TYPES) type: string;
  @IsIn(TOPIC_STATUSES) status: string;
  @IsOptional() @IsString() followUpDate?: string | null;
  @IsOptional() @IsUUID() responsibleUserId?: string | null;
  @IsBoolean() isRecurring: boolean;
  @IsOptional() @IsUUID() defaultSectionId?: string | null;
  @IsOptional() @IsInt() @Min(1) defaultPosition?: number | null;
}

export class TopicUpdateDto {
  @IsString() @IsNotEmpty() text: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsUUID() meetingId?: string | null;
}
