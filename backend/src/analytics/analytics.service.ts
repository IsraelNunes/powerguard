import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventSource, Prisma } from '@prisma/client';
import { evaluatePoint, calculateFeatureStats } from './analytics.engine';
import { AnalyticsSummaryDto } from './dto/analytics-summary.dto';
import { RunAnalyticsDto } from './dto/run-analytics.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapRiskTitle(level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') {
    const labels = {
      LOW: 'Baixo',
      MEDIUM: 'Medio',
      HIGH: 'Alto',
      CRITICAL: 'Critico'
    };
    return `Risco ${labels[level]}`;
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
      take: query.limit ?? 5000
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

    await this.prisma.$transaction(async (tx) => {
      await tx.alertEvent.deleteMany({
        where: {
          equipmentId: query.equipmentId,
          source: EventSource.ANALYTICS,
          timestamp: {
            gte: fromTs,
            lte: toTs
          }
        }
      });

      for (const entry of evaluations) {
        await tx.anomalyResult.upsert({
          where: { measurementId: entry.measurement.id },
          create: {
            analysisRunId: run.id,
            measurementId: entry.measurement.id,
            isAnomaly: entry.evaluated.isAnomaly,
            anomalyScore: entry.evaluated.anomalyScore,
            featureImpactJson: entry.evaluated.featureImpact as Prisma.InputJsonValue,
            riskScore: entry.evaluated.riskScore,
            riskLevel: entry.evaluated.riskLevel
          },
          update: {
            analysisRunId: run.id,
            isAnomaly: entry.evaluated.isAnomaly,
            anomalyScore: entry.evaluated.anomalyScore,
            featureImpactJson: entry.evaluated.featureImpact as Prisma.InputJsonValue,
            riskScore: entry.evaluated.riskScore,
            riskLevel: entry.evaluated.riskLevel,
            createdAt: new Date()
          }
        });

        if (entry.evaluated.isAnomaly || entry.evaluated.riskLevel === 'CRITICAL') {
          await tx.alertEvent.create({
            data: {
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
            }
          });
        }
      }
    });

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
