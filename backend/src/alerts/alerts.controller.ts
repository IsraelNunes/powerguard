import { Controller, Get, Query } from '@nestjs/common';
import { QueryAlertsDto } from './dto/query-alerts.dto';
import { AlertsService } from './alerts.service';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  async findMany(@Query() query: QueryAlertsDto) {
    return this.alertsService.findMany(query);
  }
}
