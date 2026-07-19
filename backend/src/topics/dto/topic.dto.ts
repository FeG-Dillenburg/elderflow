import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { TOPIC_STATUSES, TopicType } from '../topic.entity';

export class TopicDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() description?: string | null;
  @IsString() type: TopicType;
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
