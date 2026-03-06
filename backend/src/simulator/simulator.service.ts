import { Injectable, NotFoundException } from '@nestjs/common';
import { EventSource, Prisma } from '@prisma/client';
import { evaluatePoint, calculateFeatureStats } from '../analytics/analytics.engine';
import { PrismaService } from '../prisma/prisma.service';
import { WhatIfDto } from './dto/what-if.dto';

@Injectable()
export class SimulatorService {
  constructor(private readonly prisma: PrismaService) {}

  private mapRiskTitle(level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') {
    const labels = {
      LOW: 'Baixo',
      MEDIUM: 'Medio',
      HIGH: 'Alto',
      CRITICAL: 'Critico'
    };
    return `Risco Simulado ${labels[level]}`;
  }

  async simulate(input: WhatIfDto) {
    const equipment = await this.prisma.equipment.findUnique({ where: { id: input.equipmentId } });
    if (!equipment) {
      throw new NotFoundException(`equipmentId not found: ${input.equipmentId}`);
    }

    const reference = input.baseMeasurementId
      ? await this.prisma.measurement.findUnique({ where: { id: input.baseMeasurementId } })
      : await this.prisma.measurement.findFirst({
          where: { equipmentId: input.equipmentId },
          orderBy: { timestamp: 'desc' }
        });

    if (!reference || reference.equipmentId !== input.equipmentId) {
      throw new NotFoundException('reference measurement not found for equipment');
    }

    const history = await this.prisma.measurement.findMany({
      where: { equipmentId: input.equipmentId },
      orderBy: { timestamp: 'asc' },
      take: 1000
    });

    if (history.length < 30) {
      throw new NotFoundException('at least 30 measurements are required for what-if simulation');
    }

    const stats = calculateFeatureStats(
      history.map((m) => ({
        voltage: m.voltage,
        current: m.current,
        power: m.power,
        frequency: m.frequency,
        temperature: m.temperature
      }))
    );

    const currentEval = evaluatePoint(
      {
        voltage: reference.voltage,
        current: reference.current,
        power: reference.power,
        frequency: reference.frequency,
        temperature: reference.temperature
      },
      stats
    );

    const simulatedVoltage = reference.voltage * (1 + input.voltageDeltaPercent / 100);
    const simulatedCurrent = reference.current * (1 + input.currentDeltaPercent / 100);
    const simulatedTemperature = reference.temperature * (1 + input.temperatureDeltaPercent / 100);
    const simulatedPower = simulatedVoltage * simulatedCurrent;

    const simulatedEval = evaluatePoint(
      {
        voltage: simulatedVoltage,
        current: simulatedCurrent,
        power: simulatedPower,
        frequency: reference.frequency,
        temperature: simulatedTemperature
      },
      stats
    );

    await this.prisma.alertEvent.create({
      data: {
        equipmentId: input.equipmentId,
        timestamp: new Date(),
        severity: simulatedEval.severity,
        title: this.mapRiskTitle(simulatedEval.riskLevel),
        explanation: simulatedEval.explanation,
        rootCauseHint: simulatedEval.rootCauseHint,
        source: EventSource.SIMULATION,
        payloadJson: {
          baselineMeasurementId: reference.id,
          deltas: {
            currentDeltaPercent: input.currentDeltaPercent,
            voltageDeltaPercent: input.voltageDeltaPercent,
            temperatureDeltaPercent: input.temperatureDeltaPercent
          },
          baselineRiskScore: currentEval.riskScore,
          simulatedRiskScore: simulatedEval.riskScore,
          featureImpact: simulatedEval.featureImpact
        } as Prisma.InputJsonValue
      }
    });

    return {
      equipmentId: input.equipmentId,
      baseline: {
        measurementId: reference.id,
        timestamp: reference.timestamp,
        values: {
          voltage: reference.voltage,
          current: reference.current,
          power: reference.power,
          frequency: reference.frequency,
          temperature: reference.temperature
        },
        riskScore: currentEval.riskScore,
        riskLevel: currentEval.riskLevel
      },
      simulated: {
        values: {
          voltage: Number(simulatedVoltage.toFixed(2)),
          current: Number(simulatedCurrent.toFixed(2)),
          power: Number(simulatedPower.toFixed(2)),
          frequency: reference.frequency,
          temperature: Number(simulatedTemperature.toFixed(2))
        },
        riskScore: simulatedEval.riskScore,
        riskLevel: simulatedEval.riskLevel,
        explanation: simulatedEval.explanation,
        rootCauseHint: simulatedEval.rootCauseHint,
        featureImpact: simulatedEval.featureImpact
      },
      delta: {
        riskScore: simulatedEval.riskScore - currentEval.riskScore
      }
    };
  }
}
