import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class StartSolarTrainingDto {
  @IsString()
  plantId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(730)
  trainWindowDays?: number;

  @IsOptional()
  @IsString()
  algorithm?: string;

  @IsOptional()
  @IsBoolean()
  activateModel?: boolean;

  @IsOptional()
  @IsString()
  requestedBy?: string;
}
