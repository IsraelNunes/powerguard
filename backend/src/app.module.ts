import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AlertsModule } from './alerts/alerts.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { HealthModule } from './health/health.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { MeasurementsModule } from './measurements/measurements.module';
import { PrismaModule } from './prisma/prisma.module';
import { SolarModule } from './solar/solar.module';
import { SimulatorModule } from './simulator/simulator.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    IngestionModule,
    MeasurementsModule,
    AnalyticsModule,
    AlertsModule,
    SimulatorModule,
    SolarModule
  ]
})
export class AppModule {}
