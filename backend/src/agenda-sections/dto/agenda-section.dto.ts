import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { TOPIC_TYPES, TopicType } from '../../topics/topic.entity';

export class AgendaSectionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  name: string;

  @IsOptional()
  @IsIn(TOPIC_TYPES)
  defaultTopicType?: TopicType | null;
}
