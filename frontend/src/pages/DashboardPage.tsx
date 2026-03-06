import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { AssetRankingCard } from '../components/AssetRankingCard';
import { AlertsTable } from '../components/AlertsTable';
import { CriticalScenarioCard } from '../components/CriticalScenarioCard';
import { KPIGrid } from '../components/KPIGrid';
import { QuickActionsCard } from '../components/QuickActionsCard';
import { TimeseriesChart } from '../components/TimeseriesChart';
import { UploadCard } from '../components/UploadCard';
import { WhatIfPanel } from '../components/WhatIfPanel';
import { fetchAnalyticsRanking, runAnalytics } from '../features/analytics/api';
import { fetchHealth } from '../features/health/api';
import { uploadCsv } from '../features/ingestion/api';
import { simulateDataset } from '../features/ingestion/simulate';
import { useDashboardData } from '../hooks/useDashboardData';
import { AlertSeverity } from '../types/api';

type PeriodPreset = 'all' | '1h' | '24h' | '7d' | 'custom';

export function DashboardPage() {
  const queryClient = useQueryClient();
  const alertsRef = useRef<HTMLElement | null>(null);
  const simulatorRef = useRef<HTMLElement | null>(null);
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<AlertSeverity | 'ALL'>('ALL');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [customWeeks, setCustomWeeks] = useState<number>(0);
  const [customDays, setCustomDays] = useState<number>(0);
  const [customHours, setCustomHours] = useState<number>(24);

  const { fromIso, toIso } = useMemo(() => {
    const now = new Date();
    const end = now.toISOString();

    if (periodPreset === 'all') {
      return { fromIso: undefined, toIso: undefined };
    }

    if (periodPreset === 'custom') {
      const totalHours = customWeeks * 7 * 24 + customDays * 24 + customHours;
      if (totalHours <= 0) {
        return { fromIso: undefined, toIso: undefined };
      }
      const start = new Date(now);
      start.setHours(start.getHours() - totalHours);
      return {
        fromIso: start.toISOString(),
        toIso: end
      };
    }

    const start = new Date(now);
    if (periodPreset === '1h') {
      start.setHours(start.getHours() - 1);
    } else if (periodPreset === '24h') {
      start.setHours(start.getHours() - 24);
    } else {
      start.setDate(start.getDate() - 7);
    }

    return { fromIso: start.toISOString(), toIso: end };
  }, [periodPreset, customWeeks, customDays, customHours]);

  const periodDescription = useMemo(() => {
    if (periodPreset === 'all') {
      return 'Aplicando: todo o período disponível no CSV.';
    }

    if (!fromIso || !toIso) {
      return 'Aplicando: período não definido.';
    }

    return `Aplicando: ${new Date(fromIso).toLocaleString()} até ${new Date(toIso).toLocaleString()}.`;
  }, [periodPreset, fromIso, toIso]);

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 30000
  });
  const rankingQuery = useQuery({
    queryKey: ['analytics-ranking'],
    queryFn: () => fetchAnalyticsRanking(5),
    refetchInterval: 30000
  });

  const dashboardData = useDashboardData({
    equipmentId,
    severity: severity === 'ALL' ? undefined : severity,
    from: fromIso,
    to: toIso
  });

  const uploadMutation = useMutation({
    mutationFn: async (payload: { file: File; equipmentName?: string }) => {
      const ingestion = await uploadCsv(payload.file, payload.equipmentName);
      await runAnalytics(ingestion.equipmentId);
      return ingestion;
    },
    onSuccess: async (ingestion) => {
      setEquipmentId(ingestion.equipmentId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['measurements'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics-ranking'] })
      ]);
    }
  });

  const rerunAnalyticsMutation = useMutation({
    mutationFn: async () => {
      if (!equipmentId) return null;
      return runAnalytics(equipmentId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['measurements'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics-ranking'] })
      ]);
    }
  });

  const demoMutation = useMutation({
    mutationFn: async () => {
      const generated = await simulateDataset({
        days: 14,
        intervalMinutes: 5,
        equipmentName: `Demo Hackathon ${new Date().toISOString().slice(0, 16)}`
      });
      await runAnalytics(generated.equipmentId);
      return generated;
    },
    onSuccess: async (generated) => {
      setEquipmentId(generated.equipmentId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['measurements'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics-ranking'] })
      ]);
    }
  });

  const uploadError = useMemo(() => {
    if (!uploadMutation.error) return null;
    const error = uploadMutation.error as AxiosError<{ message?: string }>;
    return error.response?.data?.message ?? error.message;
  }, [uploadMutation.error]);

  const currentRisk = dashboardData.summaryQuery.data?.summary.risk.current;
  const criticalCount = dashboardData.summaryQuery.data?.summary.criticalCount ?? 0;
  const recommendation = dashboardData.summaryQuery.data?.summary.recommendation;
  const potentialAvoidedCostUSD = dashboardData.summaryQuery.data?.summary.impact?.potentialAvoidedCostUSD;
  const hasCriticalScenario = (currentRisk ?? 0) >= 75 || criticalCount > 0;
  const timeSinceLastCriticalHours =
    dashboardData.summaryQuery.data?.reliability.timeSinceLastCriticalHours ?? null;
  const isQuickActionBusy =
    uploadMutation.isPending || rerunAnalyticsMutation.isPending || demoMutation.isPending;

  return (
    <main className="layout">
      <header className="topbar row-between">
        <div>
          <h1>PowerGuard AI</h1>
          <p>Monitoramento de Confiabilidade Elétrica</p>
        </div>
        <div className="health-pill">
          <span className={`dot ${healthQuery.data?.status === 'ok' ? 'ok' : 'down'}`} />
          {healthQuery.data?.status === 'ok' ? 'API Operacional' : 'API indisponível'}
        </div>
      </header>

      <section className="grid">
        <CriticalScenarioCard
          visible={Boolean(equipmentId) && hasCriticalScenario}
          currentRisk={currentRisk}
          criticalCount={criticalCount}
          timeSinceLastCriticalHours={timeSinceLastCriticalHours}
          recommendation={recommendation}
          potentialAvoidedCostUSD={potentialAvoidedCostUSD}
          onOpenCriticalAlerts={() => {
            setSeverity('CRITICAL');
            alertsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          onOpenSimulator={() => {
            simulatorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />

        <article className="card wide">
          <div className="row-between">
            <h2>Filtro de Período</h2>
            <select
              value={periodPreset}
              onChange={(event) => setPeriodPreset(event.target.value as PeriodPreset)}
            >
              <option value="all">Todo o período</option>
              <option value="1h">Última 1 hora</option>
              <option value="24h">Últimas 24 horas</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="custom">Período customizado</option>
            </select>
          </div>

          <p className="muted">{periodDescription}</p>

          {periodPreset === 'custom' ? (
            <div className="period-grid">
              <label>
                Semanas
                <input
                  type="number"
                  min={0}
                  max={52}
                  value={customWeeks}
                  onChange={(event) => setCustomWeeks(Number(event.target.value))}
                />
              </label>
              <label>
                Dias
                <input
                  type="number"
                  min={0}
                  max={31}
                  value={customDays}
                  onChange={(event) => setCustomDays(Number(event.target.value))}
                />
              </label>
              <label>
                Horas
                <input
                  type="number"
                  min={0}
                  max={720}
                  value={customHours}
                  onChange={(event) => setCustomHours(Number(event.target.value))}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setCustomWeeks(1);
                  setCustomDays(0);
                  setCustomHours(0);
                }}
              >
                Usar 1 semana
              </button>
            </div>
          ) : null}
        </article>

        <UploadCard
          onUpload={async (file, equipmentName) => {
            await uploadMutation.mutateAsync({ file, equipmentName });
          }}
          isLoading={uploadMutation.isPending}
          lastResult={
            uploadMutation.data
              ? {
                  equipmentId: uploadMutation.data.equipmentId,
                  rowsInserted: uploadMutation.data.rowsInserted
                }
              : undefined
          }
        />

        <KPIGrid
          summary={dashboardData.summaryQuery.data}
          measurements={dashboardData.measurementsView}
          trend={dashboardData.trend}
          loading={dashboardData.summaryQuery.isLoading || dashboardData.measurementsQuery.isLoading}
        />

        <AssetRankingCard ranking={rankingQuery.data} loading={rankingQuery.isLoading} />

        <QuickActionsCard
          disabled={!equipmentId}
          isBusy={isQuickActionBusy}
          onRunDemo={async () => {
            await demoMutation.mutateAsync();
          }}
          onRerunAnalytics={async () => {
            await rerunAnalyticsMutation.mutateAsync();
          }}
        />

        {uploadError ? <p className="error card wide">Erro no upload: {uploadError}</p> : null}

        <TimeseriesChart
          measurements={dashboardData.measurementsView}
          alerts={dashboardData.alertsQuery.data?.items ?? []}
          loading={dashboardData.measurementsQuery.isLoading}
        />

        {dashboardData.rangeAutoAdjusted ? (
          <p className="card wide muted">
            Período reajustado automaticamente para a janela mais recente disponível no CSV.
          </p>
        ) : null}

        <section ref={simulatorRef}>
          <WhatIfPanel equipmentId={equipmentId} />
        </section>

        <section ref={alertsRef} className="wide">
          <AlertsTable
            alerts={dashboardData.alertsQuery.data}
            loading={dashboardData.alertsQuery.isLoading}
            severity={severity}
            onSeverityChange={setSeverity}
          />
        </section>
      </section>

      {!equipmentId ? (
        <p className="hint">Faça upload de um CSV para iniciar a análise automática de risco.</p>
      ) : null}
    </main>
  );
}
