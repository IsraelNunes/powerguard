import axios from 'axios';
import { axiosClient } from '../../lib/axiosClient';
import { AnalyticsRankingResponse, AnalyticsRunResponse, AnalyticsSummaryResponse } from '../../types/api';

export async function runAnalytics(equipmentId: string): Promise<AnalyticsRunResponse> {
  const { data } = await axiosClient.post<AnalyticsRunResponse>('/analytics/run', null, {
    params: { equipmentId }
  });
  return data;
}

export async function fetchAnalyticsSummary(
  equipmentId: string
): Promise<AnalyticsSummaryResponse | null> {
  try {
    const { data } = await axiosClient.get<AnalyticsSummaryResponse>('/analytics/summary', {
      params: { equipmentId }
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function fetchAnalyticsRanking(limit = 5): Promise<AnalyticsRankingResponse> {
  const { data } = await axiosClient.get<AnalyticsRankingResponse>('/analytics/ranking', {
    params: { limit }
  });
  return data;
}
