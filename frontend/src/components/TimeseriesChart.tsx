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

export function TimeseriesChart({ measurements, alerts, loading }: Props) {
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
      <h2>Série Temporal</h2>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" minTickGap={24} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="voltage" stroke="#1f77b4" dot={false} />
            <Line type="monotone" dataKey="current" stroke="#2ca02c" dot={false} />
            <Line type="monotone" dataKey="power" stroke="#ff7f0e" dot={false} />
            <Line type="monotone" dataKey="temperature" stroke="#d62728" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {alertSet.size > 0 ? (
        <p className="muted">Medições com alerta foram identificadas na análise.</p>
      ) : null}
    </article>
  );
}
