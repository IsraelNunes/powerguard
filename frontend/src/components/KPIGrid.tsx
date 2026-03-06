import { AnalyticsSummaryResponse, MeasurementsResponse } from '../types/api';

interface Props {
  summary: AnalyticsSummaryResponse | null | undefined;
  measurements: MeasurementsResponse | undefined;
  trend: number;
  loading: boolean;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

export function KPIGrid({ summary, measurements, trend, loading }: Props) {
  if (loading) {
    return <article className="card">Carregando KPIs...</article>;
  }

  const items = measurements?.items ?? [];
  const latest = items[items.length - 1];
  const avgVoltage = average(items.map((item) => item.voltage));
  const avgTemp = average(items.map((item) => item.temperature));

  return (
    <article className="card">
      <h2>KPIs Executivos</h2>
      <div className="kpi-grid">
        <div className="kpi">
          <span>Risco Atual</span>
          <strong>{summary?.summary.risk.current ?? '-'} / 100</strong>
        </div>
        <div className="kpi">
          <span>Eventos (7d)</span>
          <strong>{summary?.reliability.weeklyEvents ?? 0}</strong>
        </div>
        <div className="kpi">
          <span>Tendência de Potência</span>
          <strong>{trend}%</strong>
        </div>
        <div className="kpi">
          <span>Último Crítico (h)</span>
          <strong>{summary?.reliability.timeSinceLastCriticalHours ?? '-'}</strong>
        </div>
        <div className="kpi">
          <span>Tensão Média</span>
          <strong>{avgVoltage}</strong>
        </div>
        <div className="kpi">
          <span>Temperatura Média</span>
          <strong>{avgTemp}</strong>
        </div>
        <div className="kpi">
          <span>Total de medições</span>
          <strong>{measurements?.count ?? 0}</strong>
        </div>
        <div className="kpi">
          <span>Última leitura</span>
          <strong>{latest ? new Date(latest.timestamp).toLocaleString() : '-'}</strong>
        </div>
      </div>
    </article>
  );
}
