import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class TaskEncryptedScalarsDto {
  @IsString() @IsNotEmpty() titleEnvelope: string;
  @IsString() @IsNotEmpty() descriptionEnvelope: string;
}

export class TaskEncryptedScalarPatchDto {
  @IsOptional() @IsString() @IsNotEmpty() titleEnvelope?: string;
  @IsOptional() @IsString() @IsNotEmpty() descriptionEnvelope?: string;
}

export class TaskDto {
  @IsUUID() id: string;
  @IsDefined() @ValidateNested() @Type(() => TaskEncryptedScalarsDto)
  protected: TaskEncryptedScalarsDto;
  @IsOptional() @IsUUID() topicId?: string | null;
  @IsOptional() @IsUUID() meetingId?: string | null;
  @IsOptional() @IsUUID() assignedToId?: string | null;
  @IsOptional() @IsString() dueDate?: string | null;
  @IsIn(['open', 'in_progress', 'done', 'cancelled']) status: string;
}

export class TaskUpdateDto {
  @IsOptional() @ValidateNested() @Type(() => TaskEncryptedScalarPatchDto)
  protected?: TaskEncryptedScalarPatchDto;
  @IsOptional() @IsUUID() topicId?: string | null;
  @IsOptional() @IsUUID() meetingId?: string | null;
  @IsOptional() @IsUUID() assignedToId?: string | null;
  @IsOptional() @IsString() dueDate?: string | null;
  @IsOptional() @IsIn(['open', 'in_progress', 'done', 'cancelled']) status?: string;
}
