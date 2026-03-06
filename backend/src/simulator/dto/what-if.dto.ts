import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class WhatIfDto {
  @IsString()
  equipmentId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(-20)
  @Max(20)
  currentDeltaPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-10)
  @Max(10)
  voltageDeltaPercent!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-20)
  @Max(20)
  temperatureDeltaPercent!: number;

  @IsOptional()
  @IsString()
  baseMeasurementId?: string;
}
