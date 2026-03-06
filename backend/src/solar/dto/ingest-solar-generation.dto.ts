import { IsOptional, IsString } from 'class-validator';

export class IngestSolarGenerationDto {
  @IsString()
  plantId!: string;

  @IsOptional()
  @IsString()
  source?: string;
}
