import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class SolarDashboardSummaryDto {
  @IsString()
  plantId!: string;

  @IsOptional()
  @IsString()
  equipmentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20000)
  pricePerMwhBrl?: number;
}
