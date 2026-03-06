import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAlerts } from '../features/alerts/api';
import { fetchAnalyticsSummary } from '../features/analytics/api';
import { fetchMeasurements } from '../features/measurements/api';
import { AlertSeverity, MeasurementsResponse } from '../types/api';

interface Args {
  equipmentId: string | null;
  severity?: AlertSeverity;
  from?: string;
  to?: string;
}

export function useDashboardData({ equipmentId, severity, from, to }: Args) {
  const allMeasurementsQuery = useQuery({
    queryKey: ['measurements', equipmentId],
    queryFn: () =>
      fetchMeasurements({
        equipmentId: equipmentId!,
        limit: 20000
      }),
    enabled: Boolean(equipmentId)
  });

  const summaryQuery = useQuery({
    queryKey: ['analytics-summary', equipmentId],
    queryFn: () => fetchAnalyticsSummary(equipmentId!),
    enabled: Boolean(equipmentId)
  });

  const alertsQuery = useQuery({
    queryKey: ['alerts', equipmentId, severity, from, to],
    queryFn: () =>
      fetchAlerts({
        equipmentId: equipmentId!,
        severity,
        from,
        to,
        limit: 200
      }),
    enabled: Boolean(equipmentId)
  });

  const { measurementsView, rangeAutoAdjusted } = useMemo(() => {
    const source = allMeasurementsQuery.data;
    const allItems = source?.items ?? [];

    if (!source || !from || !to) {
      return {
        measurementsView: source,
        rangeAutoAdjusted: false
      };
    }

    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    const filtered = allItems.filter((item) => {
      const ts = new Date(item.timestamp).getTime();
      return ts >= fromMs && ts <= toMs;
    });

    if (filtered.length > 0) {
      const response: MeasurementsResponse = {
        equipmentId: source.equipmentId,
        count: filtered.length,
        items: filtered
      };
      return { measurementsView: response, rangeAutoAdjusted: false };
    }

    if (allItems.length === 0) {
      return { measurementsView: source, rangeAutoAdjusted: false };
    }

    const durationMs = Math.max(toMs - fromMs, 0);
    const dataEnd = new Date(allItems[allItems.length - 1].timestamp).getTime();
    const adjustedStart = dataEnd - durationMs;
    const adjusted = allItems.filter((item) => {
      const ts = new Date(item.timestamp).getTime();
      return ts >= adjustedStart && ts <= dataEnd;
    });

    const response: MeasurementsResponse = {
      equipmentId: source.equipmentId,
      count: adjusted.length,
      items: adjusted
    };

    return {
      measurementsView: response,
      rangeAutoAdjusted: true
    };
  }, [allMeasurementsQuery.data, from, to]);

  const trend = useMemo(() => {
    const items = measurementsView?.items ?? [];
    if (items.length < 2) return 0;

    const last = items[items.length - 1].power;
    const first = items[0].power;

    if (first === 0) return 0;
    return Number((((last - first) / first) * 100).toFixed(2));
  }, [measurementsView]);

  return {
    measurementsQuery: allMeasurementsQuery,
    measurementsView,
    rangeAutoAdjusted,
    summaryQuery,
    alertsQuery,
    trend
  };
}
