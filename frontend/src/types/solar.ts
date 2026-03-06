export interface SolarPlant {
  id: string;
  name: string;
  onsPlantCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  installedCapacityMw: number;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SolarPlantsResponse {
  count: number;
  items: SolarPlant[];
}

export interface SolarGenerationResponse {
  plantId: string;
  count: number;
  items: Array<{
    timestamp: string;
    generationMw: number;
    capacityFactor: number | null;
  }>;
}

export interface SolarForecastRunResponse {
  forecastRunAt: string;
  plantId: string;
  modelVersionId: string;
  generatedPoints: number;
  requestedHorizons: number[];
  checkpointHours: number[];
}

export interface SolarForecastResponse {
  plantId: string;
  plantName: string;
  horizonHours: number;
  forecastRunAt: string;
  count: number;
  items: Array<{
    timestamp: string;
    horizonHours: number;
    predGenerationMw: number;
    predCapacityFactor: number;
    p10GenerationMw: number | null;
    p50GenerationMw: number | null;
    p90GenerationMw: number | null;
  }>;
}

export interface SolarTrainingStartResponse {
  jobId: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  plantId: string;
  createdAt: string;
}

export interface SolarTrainingJobResponse {
  jobId: string;
  plantId: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  params: Record<string, unknown>;
  metrics: Record<string, unknown> | null;
  modelVersionId: string | null;
  requestedBy?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export interface SolarModelsResponse {
  plantId: string;
  count: number;
  items: Array<{
    id: string;
    version: string;
    algorithm: string;
    isActive: boolean;
    metrics: {
      mae?: number;
      rmse?: number;
      mape?: number;
      trainPoints?: number;
      testPoints?: number;
    };
    trainWindowStart: string;
    trainWindowEnd: string;
    createdAt: string;
  }>;
}

export interface SolarDashboardSummaryResponse {
  plant: {
    id: string;
    name: string;
    installedCapacityMw: number;
  };
  forecast24h: {
    avgGenerationMw: number;
    avgCapacityFactor: number;
    trendPercent: number;
  };
  quality: {
    mape: number | null;
    confidenceLabel: string;
    weatherCoveragePercent: number;
  };
  insights: Array<{
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title: string;
    explanation: string;
  }>;
  financial: {
    pricePerMwhBrl: number;
    expectedEnergyMwh24h: number;
    forecastEnergyMwh24h: number;
    energyGapMwh24h: number;
    absoluteLossMwh24h: number;
    expectedCapacityFactor24h: number;
    revenueExpectedBrl24h: number;
    revenueForecastBrl24h: number;
    revenueGapBrl24h: number;
    estimatedLossBrl24h: number;
    potentialAvoidedLossBrl: number;
  };
  riskBridge: {
    baseRisk: number;
    amplifiedRisk: number;
    delta: number;
    reason: string;
  };
}
