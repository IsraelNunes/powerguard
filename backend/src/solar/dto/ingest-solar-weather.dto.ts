import { IsOptional, IsString } from 'class-validator';

export class IngestSolarWeatherDto {
  @IsString()
  plantId!: string;

  @IsOptional()
  @IsString()
  source?: string;
}
