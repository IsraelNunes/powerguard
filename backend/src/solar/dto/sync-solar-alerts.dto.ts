import { IsOptional, IsString } from 'class-validator';

export class SyncSolarAlertsDto {
  @IsString()
  plantId!: string;

  @IsString()
  equipmentId!: string;

  @IsOptional()
  @IsString()
  mode?: string;
}
