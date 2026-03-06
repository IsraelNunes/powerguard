import { SolarDashboardSummaryResponse } from '../types/solar';

interface Props {
  summary: SolarDashboardSummaryResponse | undefined;
  loading: boolean;
}

export function SolarForecastKPIGrid({ summary, loading }: Props) {
  if (loading) return <article className="card">Carregando KPIs solares...</article>;

  return (
    <article className="card">
      <h2>KPIs Solar Forecast</h2>
      <div className="kpi-grid">
        <div className="kpi">
          <span>Geração Prevista (24h)</span>
          <strong>{summary?.forecast24h.avgGenerationMw ?? '-'} MW</strong>
        </div>
        <div className="kpi">
          <span>Fator de Capacidade</span>
          <strong>{summary ? (summary.forecast24h.avgCapacityFactor * 100).toFixed(2) : '-'}%</strong>
        </div>
        <div className="kpi">
          <span>Tendência</span>
          <strong>{summary?.forecast24h.trendPercent ?? '-'}%</strong>
        </div>
        <div className="kpi">
          <span>Erro Estimado (MAPE)</span>
          <strong>{summary?.quality.mape ?? '-'}%</strong>
        </div>
        <div className="kpi">
          <span>Confiança</span>
          <strong>{summary?.quality.confidenceLabel ?? '-'}</strong>
        </div>
        <div className="kpi">
          <span>Cobertura Clima</span>
          <strong>{summary?.quality.weatherCoveragePercent ?? '-'}%</strong>
        </div>
      </div>
    </article>
  );
}
