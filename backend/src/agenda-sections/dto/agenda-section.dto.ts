import { ValidateIf, IsInt, Min, Max, IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { TOPIC_TYPES, TopicType } from '../../topics/topic.entity';

export class AgendaSectionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  name: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  defaultMinutes?: number;

  @IsOptional()
  @IsIn(TOPIC_TYPES)
  defaultTopicType?: TopicType | null;
}
