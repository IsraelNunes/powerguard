import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HistoryVsForecastChart } from '../components/HistoryVsForecastChart';
import { SolarFinancialCharts } from '../components/SolarFinancialCharts';
import { SolarForecastKPIGrid } from '../components/SolarForecastKPIGrid';
import {
  fetchSolarDashboardSummary,
  fetchSolarForecast,
  fetchSolarGeneration,
  fetchSolarModels,
  fetchSolarPlants,
  fetchSolarTrainingJob,
  runSolarForecast,
  startSolarTraining,
  syncSolarAlerts
} from '../features/solar/api';

type HorizonOption = 24 | 168 | 720;

interface Props {
  onBackToDashboard: () => void;
}

export function SolarForecastPage({ onBackToDashboard }: Props) {
  const queryClient = useQueryClient();
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<HorizonOption>(24);
  const [jobId, setJobId] = useState<string | null>(null);
  const [equipmentId, setEquipmentId] = useState<string>('');
  const [pricePerMwhBrl, setPricePerMwhBrl] = useState<number>(650);

  const plantsQuery = useQuery({
    queryKey: ['solar-plants'],
    queryFn: fetchSolarPlants
  });

  useEffect(() => {
    if (!selectedPlantId && plantsQuery.data?.items?.length) {
      setSelectedPlantId(plantsQuery.data.items[0].id);
    }
  }, [plantsQuery.data, selectedPlantId]);

  const summaryQuery = useQuery({
    queryKey: ['solar-summary', selectedPlantId, equipmentId, pricePerMwhBrl],
    queryFn: () =>
      fetchSolarDashboardSummary({
        plantId: selectedPlantId!,
        equipmentId: equipmentId.trim() || undefined,
        pricePerMwhBrl
      }),
    enabled: Boolean(selectedPlantId),
    refetchInterval: 15000
  });

  const modelsQuery = useQuery({
    queryKey: ['solar-models', selectedPlantId],
    queryFn: () => fetchSolarModels(selectedPlantId!),
    enabled: Boolean(selectedPlantId)
  });

  const generationQuery = useQuery({
    queryKey: ['solar-generation', selectedPlantId],
    queryFn: () => fetchSolarGeneration({ plantId: selectedPlantId!, limit: 240 }),
    enabled: Boolean(selectedPlantId)
  });

  const forecastQuery = useQuery({
    queryKey: ['solar-forecast', selectedPlantId, horizon],
    queryFn: () => fetchSolarForecast({ plantId: selectedPlantId!, horizon }),
    enabled: Boolean(selectedPlantId)
  });

  const trainingStatusQuery = useQuery({
    queryKey: ['solar-training-job', jobId],
    queryFn: () => fetchSolarTrainingJob(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'DONE' || status === 'FAILED' ? false : 2000;
    }
  });

  const trainingMutation = useMutation({
    mutationFn: async () => {
      const res = await startSolarTraining({
        plantId: selectedPlantId!,
        trainWindowDays: 365,
        activateModel: true
      });
      return res;
    },
    onSuccess: async (res) => {
      setJobId(res.jobId);
      await queryClient.invalidateQueries({ queryKey: ['solar-models', selectedPlantId] });
    }
  });

  const forecastRunMutation = useMutation({
    mutationFn: async () => {
      return runSolarForecast({ plantId: selectedPlantId!, horizons: [24, 168, 720] });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['solar-forecast', selectedPlantId] }),
        queryClient.invalidateQueries({ queryKey: ['solar-summary', selectedPlantId] })
      ]);
    }
  });

  const syncAlertsMutation = useMutation({
    mutationFn: async () => {
      return syncSolarAlerts({
        plantId: selectedPlantId!,
        equipmentId: equipmentId.trim(),
        mode: 'RISK_BRIDGE'
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['solar-summary', selectedPlantId] });
    }
  });

  const activeModel = useMemo(
    () => modelsQuery.data?.items.find((item) => item.isActive),
    [modelsQuery.data]
  );

  const decision = useMemo(() => {
    const forecastItems = forecastQuery.data?.items ?? [];
    if (forecastItems.length === 0 || !summaryQuery.data) {
      return null;
    }

    const historyItems = generationQuery.data?.items ?? [];
    const buckets = new Map<number, { sum: number; count: number }>();
    for (const item of historyItems) {
      const hour = new Date(item.timestamp).getHours();
      const acc = buckets.get(hour) ?? { sum: 0, count: 0 };
      acc.sum += item.generationMw;
      acc.count += 1;
      buckets.set(hour, acc);
    }
    const baselineByHour = new Map<number, number>();
    for (let hour = 0; hour < 24; hour += 1) {
      const bucket = buckets.get(hour);
      baselineByHour.set(hour, bucket && bucket.count > 0 ? bucket.sum / bucket.count : 0);
    }

    const forecastAvg =
      forecastItems.reduce((sum, item) => sum + item.predGenerationMw, 0) / forecastItems.length;
    const baselineAvg =
      forecastItems.reduce((sum, item) => {
        const hour = new Date(item.timestamp).getHours();
        return sum + (baselineByHour.get(hour) ?? item.predGenerationMw);
      }, 0) / forecastItems.length;
    const deficitPercent =
      baselineAvg > 0 ? Number((((forecastAvg - baselineAvg) / baselineAvg) * 100).toFixed(2)) : 0;

    const delta = summaryQuery.data.riskBridge.delta;
    const highRisk = summaryQuery.data.riskBridge.amplifiedRisk >= 75;
    const lowSolar = summaryQuery.data.forecast24h.avgCapacityFactor < 0.3;

    let recommendation = 'Monitorar operação normalmente e manter avaliação contínua.';
    if (lowSolar && highRisk) {
      recommendation =
        'Ação imediata: sincronizar alerta contextual, reduzir dependência solar e priorizar contingência.';
    } else if (lowSolar || delta >= 8) {
      recommendation =
        'Ação preventiva: revisar despacho das próximas horas e preparar ajuste de carga crítica.';
    }

    const estimatedLoss = summaryQuery.data.financial.estimatedLossBrl24h;
    if (estimatedLoss > 25000) {
      recommendation += ' Impacto financeiro crítico: acionar plano de mitigação com prioridade executiva.';
    } else if (estimatedLoss > 10000) {
      recommendation += ' Impacto financeiro relevante: antecipar redistribuição de carga e despacho.';
    }

    return {
      forecastAvg: Number(forecastAvg.toFixed(2)),
      baselineAvg: Number(baselineAvg.toFixed(2)),
      deficitPercent,
      estimatedLoss,
      recommendation
    };
  }, [forecastQuery.data, generationQuery.data, summaryQuery.data]);

  return (
    <main className="layout">
      <header className="topbar row-between">
        <div>
          <h1>Solar Forecast</h1>
          <p>Previsão de geração fotovoltaica integrada ao risco operacional</p>
        </div>
        <button type="button" className="secondary" onClick={onBackToDashboard}>
          Voltar ao Dashboard
        </button>
      </header>

      <section className="grid">
        <article className="card wide">
          <div className="row-between">
            <h2>Filtro</h2>
            <div className="row-between">
              <label>
                Usina
                <select
                  value={selectedPlantId ?? ''}
                  onChange={(event) => setSelectedPlantId(event.target.value)}
                >
                  {(plantsQuery.data?.items ?? []).map((plant) => (
                    <option key={plant.id} value={plant.id}>
                      {plant.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Horizonte
                <select
                  value={horizon}
                  onChange={(event) => setHorizon(Number(event.target.value) as HorizonOption)}
                >
                  <option value={24}>24 horas</option>
                  <option value={168}>7 dias</option>
                  <option value={720}>30 dias</option>
                </select>
              </label>
              <label>
                Equipment ID (risk bridge)
                <input
                  type="text"
                  value={equipmentId}
                  onChange={(event) => setEquipmentId(event.target.value)}
                  placeholder="cmm... equipamento elétrico"
                />
              </label>
              <label>
                Tarifa (R$/MWh)
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={pricePerMwhBrl}
                  onChange={(event) => setPricePerMwhBrl(Number(event.target.value) || 0)}
                />
              </label>
            </div>
          </div>
          <div className="row-between">
            <button
              type="button"
              onClick={() => void trainingMutation.mutateAsync()}
              disabled={!selectedPlantId || trainingMutation.isPending}
            >
              {trainingMutation.isPending ? 'Iniciando treino...' : 'Treinar Modelo'}
            </button>
            <button
              type="button"
              onClick={() => void forecastRunMutation.mutateAsync()}
              disabled={!selectedPlantId || forecastRunMutation.isPending}
            >
              {forecastRunMutation.isPending ? 'Rodando previsão...' : 'Rodar Previsão'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void syncAlertsMutation.mutateAsync()}
              disabled={!selectedPlantId || !equipmentId.trim() || syncAlertsMutation.isPending}
            >
              {syncAlertsMutation.isPending ? 'Sincronizando alerta...' : 'Sincronizar Alerta Contextual'}
            </button>
          </div>
          {trainingStatusQuery.data ? (
            <p className="muted">
              Job {trainingStatusQuery.data.jobId}: {trainingStatusQuery.data.status}
              {trainingStatusQuery.data.errorMessage
                ? ` | erro: ${trainingStatusQuery.data.errorMessage}`
                : ''}
            </p>
          ) : null}
          {syncAlertsMutation.data ? (
            <p className="muted">
              Sync alertas: {syncAlertsMutation.data.createdAlerts} criado(s)
              {syncAlertsMutation.data.reason ? ` | ${syncAlertsMutation.data.reason}` : ''}
            </p>
          ) : null}
          {activeModel ? (
            <p className="muted">
              Modelo ativo: {activeModel.version} ({activeModel.algorithm}) | MAPE:{' '}
              {activeModel.metrics.mape ?? '-'}%
            </p>
          ) : (
            <p className="muted">Sem modelo ativo para esta usina.</p>
          )}
        </article>

        <SolarForecastKPIGrid summary={summaryQuery.data} loading={summaryQuery.isLoading} />

        <article className="card">
          <h2>Insights</h2>
          {(summaryQuery.data?.insights ?? []).map((insight) => (
            <div key={`${insight.title}-${insight.severity}`} className="alert-item">
              <div className="row-between">
                <strong>{insight.title}</strong>
                <span className={`badge ${insight.severity.toLowerCase()}`}>{insight.severity}</span>
              </div>
              <small>{insight.explanation}</small>
            </div>
          ))}
        </article>

        <article className="card">
          <h2>Integração com Risco</h2>
          <div className="kpi-grid">
            <div className="kpi">
              <span>Risco Base</span>
              <strong>{summaryQuery.data?.riskBridge.baseRisk ?? 0}</strong>
            </div>
            <div className="kpi">
              <span>Risco Ampliado</span>
              <strong>{summaryQuery.data?.riskBridge.amplifiedRisk ?? 0}</strong>
            </div>
            <div className="kpi">
              <span>Delta Solar</span>
              <strong>{summaryQuery.data?.riskBridge.delta ?? 0}</strong>
            </div>
          </div>
          <p className="muted">{summaryQuery.data?.riskBridge.reason}</p>
        </article>

        <article className="card wide critical-card">
          <div className="critical-head">
            <h2>Painel de Decisão Operacional</h2>
            <span className="critical-badge">Ação Recomendada</span>
          </div>
          {!decision ? (
            <p className="muted">Rode previsão para receber diagnóstico operacional.</p>
          ) : (
            <>
              <div className="critical-metrics">
                <div>
                  <small>Previsão Média</small>
                  <strong>{decision.forecastAvg} MW</strong>
                </div>
                <div>
                  <small>Perfil Esperado</small>
                  <strong>{decision.baselineAvg} MW</strong>
                </div>
                <div>
                  <small>Déficit vs Esperado</small>
                  <strong>{decision.deficitPercent}%</strong>
                </div>
                <div>
                  <small>Perda Estimada (24h)</small>
                  <strong>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      decision.estimatedLoss
                    )}
                  </strong>
                </div>
              </div>
              <p className="muted">{decision.recommendation}</p>
            </>
          )}
        </article>

        <HistoryVsForecastChart
          generation={generationQuery.data}
          forecast={forecastQuery.data}
          installedCapacityMw={summaryQuery.data?.plant.installedCapacityMw}
          loading={generationQuery.isLoading || forecastQuery.isLoading}
        />

        <SolarFinancialCharts
          summary={summaryQuery.data}
          generation={generationQuery.data}
          forecast={forecastQuery.data}
          loading={generationQuery.isLoading || forecastQuery.isLoading || summaryQuery.isLoading}
        />
      </section>
    </main>
  );
}
