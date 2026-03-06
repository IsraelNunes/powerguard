import { IsString } from 'class-validator';

export class ListSolarModelsDto {
  @IsString()
  plantId!: string;
}
