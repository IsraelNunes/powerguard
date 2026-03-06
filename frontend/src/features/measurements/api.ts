import { axiosClient } from '../../lib/axiosClient';
import { MeasurementsResponse } from '../../types/api';

interface Params {
  equipmentId: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function fetchMeasurements(params: Params): Promise<MeasurementsResponse> {
  const { data } = await axiosClient.get<MeasurementsResponse>('/measurements', { params });
  return data;
}
