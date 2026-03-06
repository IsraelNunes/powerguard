import { IsString } from 'class-validator';

export class AnalyticsSummaryDto {
  @IsString()
  equipmentId!: string;
}
