import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Scatter,
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

type MetricKey = 'voltage' | 'current' | 'temperature';
type SeverityKey = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

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

  const alertMap = new Map(alerts.map((alert) => [alert.timestamp, alert.severity] as const));
  const alertMarkers = points
    .filter((point) => alertMap.has(point.timestamp))
    .map((point) => ({
      ...point,
      severity: (alertMap.get(point.timestamp) ?? 'LOW') as SeverityKey
    }));

  const severityColor: Record<SeverityKey, string> = {
    LOW: '#0b7a4f',
    MEDIUM: '#9a6b00',
    HIGH: '#ad4c00',
    CRITICAL: '#a11717'
  };

  const charts: Array<{
    title: string;
    metricKey: MetricKey;
    color: string;
    legend: string;
  }> = [
    { title: 'Tensão', metricKey: 'voltage', color: '#1f77b4', legend: 'Tensão (V)' },
    { title: 'Corrente', metricKey: 'current', color: '#2ca02c', legend: 'Corrente (A)' },
    { title: 'Temperatura', metricKey: 'temperature', color: '#d62728', legend: 'Temperatura (°C)' }
  ];

  return (
    <>
      {charts.map((chart) => (
        <article className="card" key={chart.metricKey}>
          <h2>{chart.title}</h2>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" minTickGap={24} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey={chart.metricKey} name={chart.legend} stroke={chart.color} dot={false} />
                <Scatter
                  data={alertMarkers}
                  dataKey={chart.metricKey}
                  name="Alertas"
                  shape={(props: { cx?: number; cy?: number; payload?: { severity?: SeverityKey } }) => {
                    const { cx, cy, payload } = props;
                    if (typeof cx !== 'number' || typeof cy !== 'number') return <circle r={0} />;
                    const severity = payload?.severity ?? 'LOW';
                    const color = severityColor[severity] ?? '#a11717';
                    return <circle cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={1.2} />;
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>
      ))}
      {alertMarkers.length > 0 ? (
        <p className="card wide muted">
          Marcadores de alerta exibidos nos gráficos (cores por severidade: baixo, médio, alto e crítico).
        </p>
      ) : null}
    </>
  );
}
