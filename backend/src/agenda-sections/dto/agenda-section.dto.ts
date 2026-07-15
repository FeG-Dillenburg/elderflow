import { IsBoolean, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class AgendaSectionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @Min(1)
  position: number;

  @IsBoolean()
  isDefault: boolean;
}
