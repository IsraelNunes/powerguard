import { AlertSeverity, AlertsResponse } from '../types/api';

interface Props {
  alerts: AlertsResponse | undefined;
  loading: boolean;
  severity: AlertSeverity | 'ALL';
  onSeverityChange: (value: AlertSeverity | 'ALL') => void;
}

export function AlertsTable({ alerts, loading, severity, onSeverityChange }: Props) {
  const severityLabel: Record<AlertSeverity, string> = {
    LOW: 'Baixo',
    MEDIUM: 'Médio',
    HIGH: 'Alto',
    CRITICAL: 'Crítico'
  };

  return (
    <article className="card wide">
      <div className="row-between">
        <h2>Alertas do Sistema</h2>
        <select
          value={severity}
          onChange={(event) => onSeverityChange(event.target.value as AlertSeverity | 'ALL')}
        >
          <option value="ALL">Todos</option>
          <option value="LOW">LOW</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="HIGH">HIGH</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>
      </div>

      {loading ? <p>Carregando alertas...</p> : null}
      {!loading && (alerts?.items.length ?? 0) === 0 ? <p>Nenhum alerta para o filtro atual.</p> : null}

      <div className="alerts-list">
        {alerts?.items.map((alert) => (
          <div key={alert.id} className="alert-item">
            <div className="row-between">
              <strong>{alert.title}</strong>
              <span className={`badge ${alert.severity.toLowerCase()}`}>
                {severityLabel[alert.severity]}
              </span>
            </div>
            <p>{alert.explanation}</p>
            <small>{alert.rootCauseHint}</small>
            {alert.payloadJson?.confidence ? (
              <small>Confiança do alerta: {alert.payloadJson.confidence}%</small>
            ) : null}
            {alert.payloadJson?.recommendation ? (
              <small>Recomendação: {alert.payloadJson.recommendation}</small>
            ) : null}
            <small>{new Date(alert.timestamp).toLocaleString()}</small>
          </div>
        ))}
      </div>
    </article>
  );
}
