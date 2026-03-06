import { RiskLevel, Severity } from '@prisma/client';

export const FEATURE_KEYS = ['voltage', 'current', 'power', 'frequency', 'temperature'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface PointFeatures {
  voltage: number;
  current: number;
  power: number;
  frequency: number;
  temperature: number;
}

export interface FeatureStats {
  median: number;
  mad: number;
}

export interface EvaluatedPoint {
  robustZ: Record<FeatureKey, number>;
  absRobustZ: Record<FeatureKey, number>;
  anomalyScore: number;
  isAnomaly: boolean;
  deviationComponent: number;
  anomalyComponent: number;
  ruleComponent: number;
  riskScore: number;
  riskLevel: RiskLevel;
  featureImpact: Record<FeatureKey, number>;
  explanation: string;
  rootCauseHint: string;
  severity: Severity;
}

export interface ScoreBreakdown {
  anomalyComponent: number;
  deviationComponent: number;
  ruleComponent: number;
}
