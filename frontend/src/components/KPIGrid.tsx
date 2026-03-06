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

function variationPercent(first?: number, last?: number): number {
  if (first == null || last == null || first === 0) return 0;
  return Number((((last - first) / first) * 100).toFixed(2));
}

function trendVisual(value: number): string {
  if (value > 0.2) return '↑';
  if (value < -0.2) return '↓';
  return '→';
}

function formatUsd(value?: number): string {
  if (value == null) return '-';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

export function KPIGrid({ summary, measurements, trend, loading }: Props) {
  if (loading) {
    return <article className="card">Carregando KPIs...</article>;
  }

  const items = measurements?.items ?? [];
  const latest = items[items.length - 1];
  const first = items[0];
  const avgVoltage = average(items.map((item) => item.voltage));
  const avgTemp = average(items.map((item) => item.temperature));
  const trendVoltage = variationPercent(first?.voltage, latest?.voltage);
  const trendCurrent = variationPercent(first?.current, latest?.current);
  const trendPower = variationPercent(first?.power, latest?.power);
  const trendTemperature = variationPercent(first?.temperature, latest?.temperature);

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
        <div className="kpi">
          <span>Custo evitável estimado</span>
          <strong>{formatUsd(summary?.summary.impact?.potentialAvoidedCostUSD)}</strong>
        </div>
        <div className="kpi">
          <span>Risco de indisponibilidade (h)</span>
          <strong>{summary?.summary.impact?.estimatedDowntimeRiskHours ?? '-'}</strong>
        </div>
      </div>

      <div className="mini-trend-grid">
        <div className="mini-trend">
          <span>Tensão</span>
          <strong>
            {trendVisual(trendVoltage)} {trendVoltage}%
          </strong>
        </div>
        <div className="mini-trend">
          <span>Corrente</span>
          <strong>
            {trendVisual(trendCurrent)} {trendCurrent}%
          </strong>
        </div>
        <div className="mini-trend">
          <span>Potência</span>
          <strong>
            {trendVisual(trendPower)} {trendPower}%
          </strong>
        </div>
        <div className="mini-trend">
          <span>Temperatura</span>
          <strong>
            {trendVisual(trendTemperature)} {trendTemperature}%
          </strong>
        </div>
      </div>
    </article>
  );
}
