export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

export interface IngestionResponse {
  equipmentId: string;
  equipmentName: string;
  rowsReceived: number;
  rowsInserted: number;
  columnsDetected: string[];
}

export interface Measurement {
  id: string;
  equipmentId: string;
  timestamp: string;
  voltage: number;
  current: number;
  power: number;
  frequency: number;
  temperature: number;
  phaseA?: number;
  phaseB?: number;
  phaseC?: number;
  createdAt: string;
}

export interface MeasurementsResponse {
  equipmentId: string;
  count: number;
  items: Measurement[];
}

export interface AnalyticsRunResponse {
  runId: string;
  equipmentId: string;
  window: {
    from: string;
    to: string;
  };
  summary: {
    equipmentId: string;
    totalMeasurements: number;
    anomalyCount: number;
    anomalyRate: number;
    risk: {
      current: number;
      average: number;
      max: number;
      min: number;
    };
    criticalCount: number;
    impact?: {
      estimatedDowntimeRiskHours: number;
      potentialAvoidedCostUSD: number;
    };
    computedAt: string;
  };
}

export interface AnalyticsSummaryResponse {
  runId: string;
  equipmentId: string;
  executedAt: string;
  fromTs: string;
  toTs: string;
  summary: {
    equipmentId: string;
    totalMeasurements: number;
    anomalyCount: number;
    anomalyRate: number;
    risk: {
      current: number;
      average: number;
      max: number;
      min: number;
    };
    criticalCount: number;
    impact?: {
      estimatedDowntimeRiskHours: number;
      potentialAvoidedCostUSD: number;
    };
    computedAt: string;
  };
  reliability: {
    weeklyEvents: number;
    timeSinceLastCriticalHours: number | null;
  };
}

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AlertEvent {
  id: string;
  equipmentId: string;
  timestamp: string;
  severity: AlertSeverity;
  title: string;
  explanation: string;
  rootCauseHint: string;
  source: 'ANALYTICS' | 'SIMULATION' | 'SOLAR_FORECAST';
}

export interface AlertsResponse {
  equipmentId: string;
  count: number;
  items: AlertEvent[];
}
