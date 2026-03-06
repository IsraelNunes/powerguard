import { useEffect, useMemo, useState } from 'react';
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
  const [liveMode, setLiveMode] = useState(false);
  const [cursor, setCursor] = useState(0);

  const points = useMemo(
    () =>
      (measurements?.items ?? []).map((item) => ({
        ...item,
        label: new Date(item.timestamp).toLocaleTimeString()
      })),
    [measurements]
  );

  const displayedPoints = useMemo(() => {
    if (!liveMode || points.length <= 240) return points;
    const end = Math.max(cursor, 240);
    const start = Math.max(0, end - 240);
    return points.slice(start, end);
  }, [liveMode, points, cursor]);

  const alertMap = useMemo(
    () => new Map(alerts.map((alert) => [alert.timestamp, alert.severity] as const)),
    [alerts]
  );
  const alertMarkers = useMemo(
    () =>
      displayedPoints
        .filter((point) => alertMap.has(point.timestamp))
        .map((point) => ({
          ...point,
          severity: alertMap.get(point.timestamp) ?? 'LOW'
        })),
    [displayedPoints, alertMap]
  );

  if (loading) {
    return <article className="card wide">Carregando série temporal...</article>;
  }

  useEffect(() => {
    if (!liveMode || points.length === 0) return;

    const id = setInterval(() => {
      setCursor((prev) => (prev + 1) % points.length);
    }, 1200);

    return () => clearInterval(id);
  }, [liveMode, points.length]);

  if (points.length === 0) {
    return (
      <article className="card wide">
        Nenhum dado para exibir. Faça upload e execute a análise.
      </article>
    );
  }

  const severityColor: Record<string, string> = {
    LOW: '#0b7a4f',
    MEDIUM: '#9a6b00',
    HIGH: '#ad4c00',
    CRITICAL: '#a11717'
  };

  return (
    <article className="card wide">
      <div className="row-between">
        <h2>Série Temporal</h2>
        <div className="metric-toggle-group">
          <button
            type="button"
            className={`metric-toggle ${liveMode ? 'active' : ''}`}
            onClick={() => setLiveMode((prev) => !prev)}
          >
            {liveMode ? 'Ao vivo: ligado' : 'Ao vivo: desligado'}
          </button>
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
          <LineChart data={displayedPoints}>
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
            {activeMetrics.temperature ? (
              <Scatter
                data={alertMarkers}
                dataKey="temperature"
                name="Alertas"
                shape={(props: { cx?: number; cy?: number; payload?: { severity?: string } }) => {
                  const { cx, cy, payload } = props;
                  if (typeof cx !== 'number' || typeof cy !== 'number') return <circle r={0} />;
                  const severity = payload?.severity ?? 'LOW';
                  const color = severityColor[severity] ?? '#a11717';
                  return <circle cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={1.5} />;
                }}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!Object.values(activeMetrics).some(Boolean) ? (
        <p className="muted">Selecione ao menos uma métrica para visualizar.</p>
      ) : null}
      {alertMarkers.length > 0 ? (
        <p className="muted">Marcadores de alerta exibidos na série de temperatura (cores por severidade).</p>
      ) : null}
    </article>
  );
}
