import { IsOptional, IsString, Length } from 'class-validator';

export class UploadCsvDto {
  @IsOptional()
  @IsString()
  equipmentId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  equipmentName?: string;
}
