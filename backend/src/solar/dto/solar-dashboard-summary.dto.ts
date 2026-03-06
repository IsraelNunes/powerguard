import { IsOptional, IsString } from 'class-validator';

export class SolarDashboardSummaryDto {
  @IsString()
  plantId!: string;

  @IsOptional()
  @IsString()
  equipmentId?: string;
}
