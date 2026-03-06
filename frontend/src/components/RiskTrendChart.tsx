import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
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

type RiskFeature = 'voltage' | 'current' | 'power' | 'frequency' | 'temperature';
type SeverityKey = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function formatXAxisTick(timestamp: string, spanMs: number): string {
  const date = new Date(timestamp);
  if (spanMs <= 6 * 60 * 60 * 1000) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (spanMs <= 48 * 60 * 60 * 1000) {
    return date.toLocaleString([], {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  if (spanMs <= 21 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
  }
  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function RiskTrendChart({ measurements, alerts, loading }: Props) {
  if (loading) {
    return <article className="card wide">Carregando curva de risco...</article>;
  }

  const items = measurements?.items ?? [];
  if (items.length === 0) {
    return <article className="card wide">Sem dados para calcular risco temporal.</article>;
  }

  const features: RiskFeature[] = ['voltage', 'current', 'power', 'frequency', 'temperature'];
  const stats = new Map<RiskFeature, { median: number; mad: number }>();
  for (const feature of features) {
    const values = items.map((item) => item[feature]);
    const featureMedian = median(values);
    const mad = median(values.map((value) => Math.abs(value - featureMedian)));
    stats.set(feature, { median: featureMedian, mad: mad <= 1e-9 ? 1e-9 : mad });
  }

  const alertMap = new Map(alerts.map((alert) => [alert.timestamp, alert.severity] as const));
  const severityColor: Record<SeverityKey, string> = {
    LOW: '#0b7a4f',
    MEDIUM: '#9a6b00',
    HIGH: '#ad4c00',
    CRITICAL: '#a11717'
  };

  const points = items.map((item) => {
    const robustAbsZ = features.map((feature) => {
      const stat = stats.get(feature)!;
      const z = (0.6745 * (item[feature] - stat.median)) / (stat.mad + 1e-9);
      return Math.abs(z);
    });

    const maxAbs = Math.max(...robustAbsZ);
    const avgAbs = robustAbsZ.reduce((sum, value) => sum + value, 0) / robustAbsZ.length;
    const anomalyComponent = clamp(maxAbs / 8, 0, 1);
    const deviationComponent = clamp(avgAbs / 5, 0, 1);
    const ruleComponent = clamp((item.current > 250 || item.temperature > 80 ? 0.65 : 0.15), 0, 1);
    const riskScore = Math.round(
      clamp((0.45 * anomalyComponent + 0.35 * deviationComponent + 0.2 * ruleComponent) * 100, 0, 100)
    );

    return {
      timestamp: item.timestamp,
      risk: riskScore,
      severity: (alertMap.get(item.timestamp) ?? 'LOW') as SeverityKey
    };
  });

  const alertMarkers = points.filter((point) => alertMap.has(point.timestamp));
  const firstTs = new Date(points[0].timestamp).getTime();
  const lastTs = new Date(points[points.length - 1].timestamp).getTime();
  const spanMs = Math.max(0, lastTs - firstTs);

  return (
    <article className="card wide">
      <h2>Risco Operacional no Tempo</h2>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              minTickGap={24}
              tickFormatter={(value) => formatXAxisTick(String(value), spanMs)}
            />
            <YAxis domain={[0, 100]} />
            <Tooltip
              labelFormatter={(value) =>
                new Date(String(value)).toLocaleString([], {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              }
            />
            <Legend />
            <ReferenceLine y={25} stroke="#9bb4ca" strokeDasharray="3 3" />
            <ReferenceLine y={50} stroke="#f0ad4e" strokeDasharray="3 3" />
            <ReferenceLine y={75} stroke="#d9534f" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="risk" name="Risco (0-100)" stroke="#7e57c2" dot={false} />
            <Scatter
              data={alertMarkers}
              dataKey="risk"
              name="Alertas"
              shape={(props: { cx?: number; cy?: number; payload?: { severity?: SeverityKey } }) => {
                const { cx, cy, payload } = props;
                if (typeof cx !== 'number' || typeof cy !== 'number') return <circle r={0} />;
                const severity = payload?.severity ?? 'LOW';
                const color = severityColor[severity] ?? '#a11717';
                return <circle cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={1.4} />;
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="muted">Faixas: 0-24 baixo, 25-49 médio, 50-74 alto, 75-100 crítico.</p>
    </article>
  );
}
