import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadCsvDto } from './dto/upload-csv.dto';
import { IngestionService } from './ingestion.service';

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('csv')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async uploadCsv(
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @Body() body: UploadCsvDto
  ) {
    if (!file) {
      throw new BadRequestException('file is required (multipart/form-data, field name: file)');
    }

    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('invalid file extension, expected .csv');
    }

    return this.ingestionService.ingestCsv(file.buffer, body);
  }
}
