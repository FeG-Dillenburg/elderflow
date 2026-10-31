import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class AgendaSectionOrderDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids: string[];
}
