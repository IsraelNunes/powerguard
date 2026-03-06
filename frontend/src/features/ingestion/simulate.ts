import { axiosClient } from '../../lib/axiosClient';

export interface SimulateDataRequest {
  equipmentName?: string;
  days?: number;
  intervalMinutes?: number;
}

export interface SimulateDataResponse {
  equipmentId: string;
  equipmentName: string;
  rowsInserted: number;
  intervalMinutes: number;
  days: number;
}

export async function simulateDataset(payload: SimulateDataRequest): Promise<SimulateDataResponse> {
  const { data } = await axiosClient.post<SimulateDataResponse>('/ingestion/simulate', payload);
  return data;
}
