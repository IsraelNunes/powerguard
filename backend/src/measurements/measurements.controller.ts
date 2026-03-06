import { Controller, Get, Query } from '@nestjs/common';
import { QueryMeasurementsDto } from './dto/query-measurements.dto';
import { MeasurementsService } from './measurements.service';

@Controller('measurements')
export class MeasurementsController {
  constructor(private readonly measurementsService: MeasurementsService) {}

  @Get()
  async findMany(@Query() query: QueryMeasurementsDto) {
    return this.measurementsService.findMany(query);
  }
}
