import { axiosClient } from '../../lib/axiosClient';
import { AlertSeverity, AlertsResponse } from '../../types/api';

interface Params {
  equipmentId: string;
  severity?: AlertSeverity;
  from?: string;
  to?: string;
  limit?: number;
}

export async function fetchAlerts(params: Params): Promise<AlertsResponse> {
  const { data } = await axiosClient.get<AlertsResponse>('/alerts', { params });
  return data;
}
