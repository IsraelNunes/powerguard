import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HistoryVsForecastChart } from '../components/HistoryVsForecastChart';
import { SolarForecastKPIGrid } from '../components/SolarForecastKPIGrid';
import {
  fetchSolarDashboardSummary,
  fetchSolarForecast,
  fetchSolarGeneration,
  fetchSolarModels,
  fetchSolarPlants,
  fetchSolarTrainingJob,
  runSolarForecast,
  startSolarTraining
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
    queryKey: ['solar-summary', selectedPlantId],
    queryFn: () => fetchSolarDashboardSummary({ plantId: selectedPlantId! }),
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

  const activeModel = useMemo(
    () => modelsQuery.data?.items.find((item) => item.isActive),
    [modelsQuery.data]
  );

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
          </div>
          {trainingStatusQuery.data ? (
            <p className="muted">
              Job {trainingStatusQuery.data.jobId}: {trainingStatusQuery.data.status}
              {trainingStatusQuery.data.errorMessage
                ? ` | erro: ${trainingStatusQuery.data.errorMessage}`
                : ''}
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

        <HistoryVsForecastChart
          generation={generationQuery.data}
          forecast={forecastQuery.data}
          loading={generationQuery.isLoading || forecastQuery.isLoading}
        />
      </section>
    </main>
  );
}
