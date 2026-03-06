import { axiosClient } from '../../lib/axiosClient';
import { HealthResponse } from '../../types/api';

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await axiosClient.get<HealthResponse>('/health');
  return data;
}
