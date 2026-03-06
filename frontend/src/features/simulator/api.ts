import { axiosClient } from '../../lib/axiosClient';

export interface WhatIfRequest {
  equipmentId: string;
  currentDeltaPercent: number;
  voltageDeltaPercent: number;
  temperatureDeltaPercent: number;
  baseMeasurementId?: string;
}

export interface WhatIfResponse {
  equipmentId: string;
  baseline: {
    measurementId: string;
    timestamp: string;
    values: {
      voltage: number;
      current: number;
      power: number;
      frequency: number;
      temperature: number;
    };
    riskScore: number;
    riskLevel: string;
  };
  simulated: {
    values: {
      voltage: number;
      current: number;
      power: number;
      frequency: number;
      temperature: number;
    };
    riskScore: number;
    riskLevel: string;
    explanation: string;
    rootCauseHint: string;
    featureImpact: Record<string, number>;
  };
  delta: {
    riskScore: number;
  };
}

export async function runWhatIf(payload: WhatIfRequest): Promise<WhatIfResponse> {
  const { data } = await axiosClient.post<WhatIfResponse>('/simulator/what-if', payload);
  return data;
}
