import { axiosClient } from '../../lib/axiosClient';
import {
  SolarDashboardSummaryResponse,
  SolarForecastResponse,
  SolarForecastRunResponse,
  SolarGenerationResponse,
  SolarModelsResponse,
  SolarPlantsResponse,
  SolarTrainingJobResponse,
  SolarTrainingStartResponse
} from '../../types/solar';

export async function fetchSolarPlants(): Promise<SolarPlantsResponse> {
  const { data } = await axiosClient.get<SolarPlantsResponse>('/solar/plants');
  return data;
}

export async function fetchSolarGeneration(params: {
  plantId: string;
  limit?: number;
  from?: string;
  to?: string;
}): Promise<SolarGenerationResponse> {
  const { data } = await axiosClient.get<SolarGenerationResponse>('/solar/generation', {
    params
  });
  return data;
}

export async function startSolarTraining(payload: {
  plantId: string;
  trainWindowDays?: number;
  activateModel?: boolean;
}): Promise<SolarTrainingStartResponse> {
  const { data } = await axiosClient.post<SolarTrainingStartResponse>('/solar/forecast/train', payload);
  return data;
}

export async function fetchSolarTrainingJob(jobId: string): Promise<SolarTrainingJobResponse> {
  const { data } = await axiosClient.get<SolarTrainingJobResponse>(`/solar/forecast/train/${jobId}`);
  return data;
}

export async function fetchSolarModels(plantId: string): Promise<SolarModelsResponse> {
  const { data } = await axiosClient.get<SolarModelsResponse>('/solar/forecast/models', {
    params: { plantId }
  });
  return data;
}

export async function runSolarForecast(payload: {
  plantId: string;
  horizons?: number[];
}): Promise<SolarForecastRunResponse> {
  const { data } = await axiosClient.post<SolarForecastRunResponse>('/solar/forecast/run', payload);
  return data;
}

export async function fetchSolarForecast(params: {
  plantId: string;
  horizon?: number;
}): Promise<SolarForecastResponse> {
  const { data } = await axiosClient.get<SolarForecastResponse>('/solar/forecast', {
    params
  });
  return data;
}

export async function fetchSolarDashboardSummary(params: {
  plantId: string;
  equipmentId?: string;
  pricePerMwhBrl?: number;
}): Promise<SolarDashboardSummaryResponse> {
  const { data } = await axiosClient.get<SolarDashboardSummaryResponse>('/solar/dashboard/summary', {
    params
  });
  return data;
}

export async function syncSolarAlerts(payload: {
  plantId: string;
  equipmentId: string;
  mode?: string;
}): Promise<{ createdAlerts: number; reason?: string }> {
  const { data } = await axiosClient.post('/solar/alerts/sync', payload);
  return data;
}
