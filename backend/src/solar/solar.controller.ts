import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateSolarPlantDto } from './dto/create-solar-plant.dto';
import { IngestSolarGenerationDto } from './dto/ingest-solar-generation.dto';
import { IngestSolarWeatherDto } from './dto/ingest-solar-weather.dto';
import { IngestSolarWeatherInmetDto } from './dto/ingest-solar-weather-inmet.dto';
import { GetSolarForecastDto } from './dto/get-solar-forecast.dto';
import { ListSolarModelsDto } from './dto/list-solar-models.dto';
import { QuerySolarGenerationDto } from './dto/query-solar-generation.dto';
import { RunSolarForecastDto } from './dto/run-solar-forecast.dto';
import { SolarDashboardSummaryDto } from './dto/solar-dashboard-summary.dto';
import { StartSolarTrainingDto } from './dto/start-solar-training.dto';
import { SyncSolarAlertsDto } from './dto/sync-solar-alerts.dto';
import { SolarService } from './solar.service';

@Controller('solar')
export class SolarController {
  constructor(private readonly solarService: SolarService) {}

  @Post('plants')
  async upsertPlant(@Body() body: CreateSolarPlantDto) {
    return this.solarService.upsertPlant(body);
  }

  @Get('plants')
  async listPlants() {
    return this.solarService.listPlants();
  }

  @Get('generation')
  async getGeneration(@Query() query: QuerySolarGenerationDto) {
    return this.solarService.getGeneration(query);
  }

  @Get('dashboard/summary')
  async dashboardSummary(@Query() query: SolarDashboardSummaryDto) {
    return this.solarService.dashboardSummary(query);
  }

  @Post('ingestion/generation/csv')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async ingestGenerationCsv(
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @Body() body: IngestSolarGenerationDto
  ) {
    if (!file) {
      throw new BadRequestException('file is required (multipart/form-data, field name: file)');
    }

    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('invalid file extension, expected .csv');
    }

    return this.solarService.ingestGenerationCsv(file.buffer, body);
  }

  @Post('ingestion/weather/csv')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async ingestWeatherCsv(
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @Body() body: IngestSolarWeatherDto
  ) {
    if (!file) {
      throw new BadRequestException('file is required (multipart/form-data, field name: file)');
    }

    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('invalid file extension, expected .csv');
    }

    return this.solarService.ingestWeatherCsv(file.buffer, body);
  }

  @Post('ingestion/weather/inmet')
  @HttpCode(HttpStatus.CREATED)
  async ingestWeatherInmet(@Body() body: IngestSolarWeatherInmetDto) {
    return this.solarService.ingestWeatherFromInmet(body);
  }

  @Post('forecast/train')
  @HttpCode(HttpStatus.CREATED)
  async startTraining(@Body() body: StartSolarTrainingDto) {
    return this.solarService.startTraining(body);
  }

  @Get('forecast/train/:jobId')
  async getTrainingJob(@Param('jobId') jobId: string) {
    return this.solarService.getTrainingJob(jobId);
  }

  @Get('forecast/models')
  async listModels(@Query() query: ListSolarModelsDto) {
    return this.solarService.listModels(query);
  }

  @Post('forecast/run')
  @HttpCode(HttpStatus.CREATED)
  async runForecast(@Body() body: RunSolarForecastDto) {
    return this.solarService.runForecast(body);
  }

  @Get('forecast')
  async getForecast(@Query() query: GetSolarForecastDto) {
    return this.solarService.getForecast(query);
  }

  @Post('alerts/sync')
  @HttpCode(HttpStatus.CREATED)
  async syncAlerts(@Body() body: SyncSolarAlertsDto) {
    return this.solarService.syncAlerts(body);
  }
}
