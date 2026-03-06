import { SolarDashboardSummaryResponse } from '../types/solar';

interface Props {
  summary: SolarDashboardSummaryResponse | undefined;
  loading: boolean;
}

function formatBrl(value?: number): string {
  if (value == null) return '-';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(value);
}

export function SolarForecastKPIGrid({ summary, loading }: Props) {
  if (loading) return <article className="card">Carregando KPIs solares...</article>;

  return (
    <article className="card">
      <h2>KPIs Spin Forecast</h2>
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
        <div className="kpi">
          <span>Receita Prevista (24h)</span>
          <strong>{formatBrl(summary?.financial.revenueForecastBrl24h)}</strong>
        </div>
        <div className="kpi">
          <span>Receita Esperada (24h)</span>
          <strong>{formatBrl(summary?.financial.revenueExpectedBrl24h)}</strong>
        </div>
        <div className="kpi">
          <span>Perda Estimada (24h)</span>
          <strong>{formatBrl(summary?.financial.estimatedLossBrl24h)}</strong>
        </div>
        <div className="kpi">
          <span>Perda Evitável Potencial</span>
          <strong>{formatBrl(summary?.financial.potentialAvoidedLossBrl)}</strong>
        </div>
      </div>
    </article>
  );
}
