import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class TaskDto {
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsUUID() topicId?: string | null;
  @IsOptional() @IsUUID() meetingId?: string | null;
  @IsOptional() @IsUUID() assignedToId?: string | null;
  @IsOptional() @IsString() dueDate?: string | null;
  @IsIn(['open', 'in_progress', 'done', 'cancelled']) status: string;
}
