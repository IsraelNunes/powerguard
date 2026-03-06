import { IsDateString, IsOptional, IsString } from 'class-validator';

export class IngestSolarWeatherInmetDto {
  @IsString()
  plantId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  stationCode?: string;
}
