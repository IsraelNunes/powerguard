import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { AlertEvent, MeasurementsResponse } from '../types/api';

interface Props {
  measurements: MeasurementsResponse | undefined;
  alerts: AlertEvent[];
  loading: boolean;
}

type MetricKey = 'voltage' | 'current' | 'power' | 'temperature';

const METRICS: Array<{ key: MetricKey; label: string; color: string }> = [
  { key: 'voltage', label: 'Tensão', color: '#1f77b4' },
  { key: 'current', label: 'Corrente', color: '#2ca02c' },
  { key: 'power', label: 'Potência', color: '#ff7f0e' },
  { key: 'temperature', label: 'Temperatura', color: '#d62728' }
];

export function TimeseriesChart({ measurements, alerts, loading }: Props) {
  const [activeMetrics, setActiveMetrics] = useState<Record<MetricKey, boolean>>({
    voltage: true,
    current: true,
    power: true,
    temperature: true
  });

  if (loading) {
    return <article className="card wide">Carregando série temporal...</article>;
  }

  const points = (measurements?.items ?? []).map((item) => ({
    ...item,
    label: new Date(item.timestamp).toLocaleTimeString()
  }));

  if (points.length === 0) {
    return (
      <article className="card wide">
        Nenhum dado para exibir. Faça upload e execute a análise.
      </article>
    );
  }

  const alertSet = new Set(alerts.map((alert) => alert.timestamp));

  return (
    <article className="card wide">
      <div className="row-between">
        <h2>Série Temporal</h2>
        <div className="metric-toggle-group">
          {METRICS.map((metric) => (
            <button
              key={metric.key}
              type="button"
              className={`metric-toggle ${activeMetrics[metric.key] ? 'active' : ''}`}
              onClick={() =>
                setActiveMetrics((prev) => ({
                  ...prev,
                  [metric.key]: !prev[metric.key]
                }))
              }
            >
              <span className="metric-dot" style={{ background: metric.color }} />
              {metric.label}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" minTickGap={24} />
            <YAxis />
            <Tooltip />
            <Legend />
            {activeMetrics.voltage ? (
              <Line type="monotone" dataKey="voltage" stroke="#1f77b4" dot={false} />
            ) : null}
            {activeMetrics.current ? (
              <Line type="monotone" dataKey="current" stroke="#2ca02c" dot={false} />
            ) : null}
            {activeMetrics.power ? (
              <Line type="monotone" dataKey="power" stroke="#ff7f0e" dot={false} />
            ) : null}
            {activeMetrics.temperature ? (
              <Line type="monotone" dataKey="temperature" stroke="#d62728" dot={false} />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!Object.values(activeMetrics).some(Boolean) ? (
        <p className="muted">Selecione ao menos uma métrica para visualizar.</p>
      ) : null}
      {alertSet.size > 0 ? (
        <p className="muted">Medições com alerta foram identificadas na análise.</p>
      ) : null}
    </article>
  );
}
