import { Controller, Get, Post, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsSummaryDto } from './dto/analytics-summary.dto';
import { RunAnalyticsDto } from './dto/run-analytics.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('run')
  async run(@Query() query: RunAnalyticsDto) {
    return this.analyticsService.run(query);
  }

  @Get('summary')
  async summary(@Query() query: AnalyticsSummaryDto) {
    return this.analyticsService.summary(query);
  }
}
