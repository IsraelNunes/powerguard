import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventSource, Prisma } from '@prisma/client';
import { evaluatePoint, calculateFeatureStats } from './analytics.engine';
import { AnalyticsSummaryDto } from './dto/analytics-summary.dto';
import { RunAnalyticsDto } from './dto/run-analytics.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}
  private static readonly CHUNK_SIZE = 1000;

  private mapRiskTitle(level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') {
    const labels = {
      LOW: 'Baixo',
      MEDIUM: 'Medio',
      HIGH: 'Alto',
      CRITICAL: 'Critico'
    };
    return `Risco ${labels[level]}`;
  }

  private chunk<T>(items: T[], size = AnalyticsService.CHUNK_SIZE): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  async run(query: RunAnalyticsDto) {
    const equipment = await this.prisma.equipment.findUnique({ where: { id: query.equipmentId } });

    if (!equipment) {
      throw new NotFoundException(`equipmentId not found: ${query.equipmentId}`);
    }

    const where: Prisma.MeasurementWhereInput = {
      equipmentId: query.equipmentId
    };

    if (query.from || query.to) {
      where.timestamp = {};
      if (query.from) where.timestamp.gte = new Date(query.from);
      if (query.to) where.timestamp.lte = new Date(query.to);
    }

    const measurements = await this.prisma.measurement.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: query.limit ?? 20000
    });

    if (measurements.length < 30) {
      throw new BadRequestException('at least 30 measurements are required to run analytics');
    }

    const points = measurements.map((m) => ({
      voltage: m.voltage,
      current: m.current,
      power: m.power,
      frequency: m.frequency,
      temperature: m.temperature
    }));

    const stats = calculateFeatureStats(points);

    const evaluations = measurements.map((measurement) => ({
      measurement,
      evaluated: evaluatePoint(
        {
          voltage: measurement.voltage,
          current: measurement.current,
          power: measurement.power,
          frequency: measurement.frequency,
          temperature: measurement.temperature
        },
        stats
      )
    }));

    const fromTs = measurements[0].timestamp;
    const toTs = measurements[measurements.length - 1].timestamp;

    const riskScores = evaluations.map((entry) => entry.evaluated.riskScore);
    const anomalyCount = evaluations.filter((entry) => entry.evaluated.isAnomaly).length;
    const criticalCount = evaluations.filter((entry) => entry.evaluated.riskLevel === 'CRITICAL').length;

    const summary = {
      equipmentId: query.equipmentId,
      totalMeasurements: measurements.length,
      anomalyCount,
      anomalyRate: Number((anomalyCount / measurements.length).toFixed(4)),
      risk: {
        current: evaluations[evaluations.length - 1].evaluated.riskScore,
        average: Number((riskScores.reduce((acc, score) => acc + score, 0) / riskScores.length).toFixed(2)),
        max: Math.max(...riskScores),
        min: Math.min(...riskScores)
      },
      criticalCount,
      computedAt: new Date().toISOString()
    };

    const run = await this.prisma.analysisRun.create({
      data: {
        equipmentId: query.equipmentId,
        fromTs,
        toTs,
        summaryJson: summary as Prisma.InputJsonValue
      }
    });

    const measurementIds = evaluations.map((entry) => entry.measurement.id);
    const anomalyRows: Prisma.AnomalyResultCreateManyInput[] = evaluations.map((entry) => ({
      analysisRunId: run.id,
      measurementId: entry.measurement.id,
      isAnomaly: entry.evaluated.isAnomaly,
      anomalyScore: entry.evaluated.anomalyScore,
      featureImpactJson: entry.evaluated.featureImpact as Prisma.InputJsonValue,
      riskScore: entry.evaluated.riskScore,
      riskLevel: entry.evaluated.riskLevel
    }));

    const alertRows: Prisma.AlertEventCreateManyInput[] = evaluations
      .filter((entry) => entry.evaluated.isAnomaly || entry.evaluated.riskLevel === 'CRITICAL')
      .map((entry) => ({
        equipmentId: query.equipmentId,
        timestamp: entry.measurement.timestamp,
        severity: entry.evaluated.severity,
        title: this.mapRiskTitle(entry.evaluated.riskLevel),
        explanation: entry.evaluated.explanation,
        rootCauseHint: entry.evaluated.rootCauseHint,
        source: EventSource.ANALYTICS,
        payloadJson: {
          measurementId: entry.measurement.id,
          riskScore: entry.evaluated.riskScore,
          anomalyScore: entry.evaluated.anomalyScore,
          featureImpact: entry.evaluated.featureImpact
        } as Prisma.InputJsonValue
      }));

    await this.prisma.alertEvent.deleteMany({
      where: {
        equipmentId: query.equipmentId,
        source: EventSource.ANALYTICS,
        timestamp: {
          gte: fromTs,
          lte: toTs
        }
      }
    });

    await this.prisma.anomalyResult.deleteMany({
      where: {
        measurementId: {
          in: measurementIds
        }
      }
    });

    for (const batch of this.chunk(anomalyRows)) {
      await this.prisma.anomalyResult.createMany({ data: batch });
    }

    for (const batch of this.chunk(alertRows)) {
      await this.prisma.alertEvent.createMany({ data: batch });
    }

    return {
      runId: run.id,
      equipmentId: query.equipmentId,
      window: {
        from: fromTs,
        to: toTs
      },
      summary
    };
  }

  async summary(query: AnalyticsSummaryDto) {
    const latestRun = await this.prisma.analysisRun.findFirst({
      where: { equipmentId: query.equipmentId },
      orderBy: { executedAt: 'desc' }
    });

    if (!latestRun) {
      throw new NotFoundException(`no analytics run found for equipmentId: ${query.equipmentId}`);
    }

    const latestCriticalEvent = await this.prisma.alertEvent.findFirst({
      where: {
        equipmentId: query.equipmentId,
        severity: 'CRITICAL'
      },
      orderBy: { timestamp: 'desc' }
    });

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weeklyEvents = await this.prisma.alertEvent.count({
      where: {
        equipmentId: query.equipmentId,
        timestamp: { gte: weekAgo }
      }
    });

    return {
      runId: latestRun.id,
      equipmentId: query.equipmentId,
      executedAt: latestRun.executedAt,
      fromTs: latestRun.fromTs,
      toTs: latestRun.toTs,
      summary: latestRun.summaryJson,
      reliability: {
        weeklyEvents,
        timeSinceLastCriticalHours: latestCriticalEvent
          ? Number(((Date.now() - latestCriticalEvent.timestamp.getTime()) / (1000 * 60 * 60)).toFixed(2))
          : null
      }
    };
  }
}
