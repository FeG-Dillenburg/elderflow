import { IsInt, Min, Max } from 'class-validator';

export class SectionTimeDto {
  @IsInt()
  @Min(0)
  @Max(2147483647)
  minutes: number;
}
