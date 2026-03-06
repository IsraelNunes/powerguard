import { RiskLevel, Severity } from '@prisma/client';
import {
  FEATURE_KEYS,
  FeatureKey,
  FeatureStats,
  PointFeatures,
  EvaluatedPoint,
  ScoreBreakdown
} from '../common/risk.types';

const EPSILON = 1e-9;
const ROBUST_Z_ANOMALY_THRESHOLD = 3.5;

const FEATURE_LABEL_PT: Record<FeatureKey, string> = {
  voltage: 'tensao',
  current: 'corrente',
  power: 'potencia',
  frequency: 'frequencia',
  temperature: 'temperatura'
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateFeatureStats(points: PointFeatures[]): Record<FeatureKey, FeatureStats> {
  const stats = {} as Record<FeatureKey, FeatureStats>;

  FEATURE_KEYS.forEach((feature) => {
    const values = points.map((point) => point[feature]);
    const med = median(values);
    const absDeviations = values.map((value) => Math.abs(value - med));
    const mad = median(absDeviations);

    stats[feature] = {
      median: med,
      mad: mad < EPSILON ? EPSILON : mad
    };
  });

  return stats;
}

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 75) return RiskLevel.CRITICAL;
  if (score >= 50) return RiskLevel.HIGH;
  if (score >= 25) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

function riskLevelToPt(level: RiskLevel): string {
  switch (level) {
    case RiskLevel.CRITICAL:
      return 'critico';
    case RiskLevel.HIGH:
      return 'alto';
    case RiskLevel.MEDIUM:
      return 'medio';
    default:
      return 'baixo';
  }
}

function mapRiskToSeverity(level: RiskLevel): Severity {
  switch (level) {
    case RiskLevel.CRITICAL:
      return Severity.CRITICAL;
    case RiskLevel.HIGH:
      return Severity.HIGH;
    case RiskLevel.MEDIUM:
      return Severity.MEDIUM;
    default:
      return Severity.LOW;
  }
}

function calculateRuleComponent(values: PointFeatures, robustZ: Record<FeatureKey, number>): number {
  const currentHigh = robustZ.current > 2.5;
  const temperatureHigh = robustZ.temperature > 2.2;
  const voltageLow = robustZ.voltage < -2.0;
  const frequencyDeviation = Math.abs(robustZ.frequency) > 2.0;
  const powerVolatility = Math.abs(robustZ.power) > 2.2;

  if (currentHigh && temperatureHigh) return 1;
  if (voltageLow && currentHigh) return 0.85;
  if (frequencyDeviation && powerVolatility) return 0.75;

  if (values.temperature > 80) return 0.65;
  if (values.current > 250) return 0.65;

  return 0.15;
}

function explainRootCause(robustZ: Record<FeatureKey, number>, values: PointFeatures): string {
  const currentHigh = robustZ.current > 2.5;
  const temperatureHigh = robustZ.temperature > 2.2;
  const voltageLow = robustZ.voltage < -2.0;
  const frequencyDeviation = Math.abs(robustZ.frequency) > 2.0;
  const powerVolatility = Math.abs(robustZ.power) > 2.2;

  if (currentHigh && temperatureHigh) {
    return 'Possivel sobrecarga termica (corrente e temperatura acima do padrao)';
  }

  if (voltageLow && currentHigh) {
    return 'Queda de tensao com compensacao de corrente, indicando estresse de carga';
  }

  if (frequencyDeviation && powerVolatility) {
    return 'Instabilidade de alimentacao/rede com oscilacao de potencia';
  }

  if (values.temperature > 80) {
    return 'Aquecimento elevado sustentado, requer inspecao termica';
  }

  return 'Desvio operacional moderado sem causa unica predominante';
}

function calculateScore(components: ScoreBreakdown): number {
  const weighted =
    0.45 * components.anomalyComponent +
    0.35 * components.deviationComponent +
    0.2 * components.ruleComponent;

  return Math.round(clamp(weighted * 100, 0, 100));
}

export function evaluatePoint(
  values: PointFeatures,
  stats: Record<FeatureKey, FeatureStats>
): EvaluatedPoint {
  const robustZ = {} as Record<FeatureKey, number>;
  const absRobustZ = {} as Record<FeatureKey, number>;

  FEATURE_KEYS.forEach((feature) => {
    const { median: featureMedian, mad } = stats[feature];
    const z = 0.6745 * (values[feature] - featureMedian) / (mad + EPSILON);
    robustZ[feature] = z;
    absRobustZ[feature] = Math.abs(z);
  });

  const maxAbsZ = Math.max(...Object.values(absRobustZ));
  const avgAbsZ = Object.values(absRobustZ).reduce((sum, value) => sum + value, 0) / FEATURE_KEYS.length;

  const anomalyComponent = clamp(maxAbsZ / 8, 0, 1);
  const deviationComponent = clamp(avgAbsZ / 5, 0, 1);
  const ruleComponent = calculateRuleComponent(values, robustZ);
  const anomalyScore = clamp((0.65 * anomalyComponent + 0.35 * deviationComponent), 0, 1);
  const isAnomaly = maxAbsZ >= ROBUST_Z_ANOMALY_THRESHOLD;

  const riskScore = calculateScore({
    anomalyComponent,
    deviationComponent,
    ruleComponent
  });

  const riskLevel = getRiskLevel(riskScore);
  const severity = mapRiskToSeverity(riskLevel);

  const impactTotal = FEATURE_KEYS.reduce((sum, key) => sum + absRobustZ[key], 0) + EPSILON;
  const featureImpact = {} as Record<FeatureKey, number>;

  FEATURE_KEYS.forEach((key) => {
    featureImpact[key] = Number((absRobustZ[key] / impactTotal).toFixed(4));
  });

  const topDrivers = [...FEATURE_KEYS]
    .sort((a, b) => featureImpact[b] - featureImpact[a])
    .slice(0, 2)
    .map((key) => `${FEATURE_LABEL_PT[key]} (${Math.round(featureImpact[key] * 100)}%)`)
    .join(' e ');

  const explanation = `Risco ${riskLevelToPt(riskLevel)} influenciado por ${topDrivers}.`;

  return {
    robustZ,
    absRobustZ,
    anomalyScore: Number(anomalyScore.toFixed(4)),
    isAnomaly,
    anomalyComponent: Number(anomalyComponent.toFixed(4)),
    deviationComponent: Number(deviationComponent.toFixed(4)),
    ruleComponent: Number(ruleComponent.toFixed(4)),
    riskScore,
    riskLevel,
    featureImpact,
    explanation,
    rootCauseHint: explainRootCause(robustZ, values),
    severity
  };
}
