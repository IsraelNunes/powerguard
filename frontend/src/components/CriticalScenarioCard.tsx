interface Props {
  visible: boolean;
  currentRisk?: number;
  criticalCount?: number;
  timeSinceLastCriticalHours?: number | null;
  recommendation?: string;
  potentialAvoidedCostUSD?: number;
  onOpenCriticalAlerts: () => void;
  onOpenSimulator: () => void;
}

export function CriticalScenarioCard({
  visible,
  currentRisk,
  criticalCount,
  timeSinceLastCriticalHours,
  recommendation,
  potentialAvoidedCostUSD,
  onOpenCriticalAlerts,
  onOpenSimulator
}: Props) {
  if (!visible) {
    return null;
  }

  return (
    <article className="card wide critical-card">
      <div className="critical-head">
        <h2>Cenário Crítico Detectado</h2>
        <span className="critical-badge">Ação Recomendada</span>
      </div>

      <p>
        O ativo apresenta condição crítica de risco operacional. Priorize investigação imediata e execute
        simulação de mitigação antes da tomada de decisão.
      </p>
      {recommendation ? <p className="muted">Recomendação: {recommendation}</p> : null}
      {potentialAvoidedCostUSD ? (
        <p className="muted">Impacto estimado: até US$ {potentialAvoidedCostUSD} de custo evitável.</p>
      ) : null}

      <div className="critical-metrics">
        <div>
          <small>Risco Atual</small>
          <strong>{currentRisk ?? '-'} / 100</strong>
        </div>
        <div>
          <small>Eventos Críticos</small>
          <strong>{criticalCount ?? 0}</strong>
        </div>
        <div>
          <small>Último Crítico</small>
          <strong>
            {timeSinceLastCriticalHours == null
              ? 'não disponível'
              : `${timeSinceLastCriticalHours.toFixed(1)}h atrás`}
          </strong>
        </div>
      </div>

      <div className="critical-actions">
        <button type="button" onClick={onOpenCriticalAlerts}>
          Ver Alertas Críticos
        </button>
        <button type="button" className="secondary" onClick={onOpenSimulator}>
          Abrir Simulador What-If
        </button>
      </div>
    </article>
  );
}
