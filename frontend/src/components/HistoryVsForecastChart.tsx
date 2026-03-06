import {
  Area,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { SolarForecastResponse, SolarGenerationResponse } from '../types/solar';

interface Props {
  generation: SolarGenerationResponse | undefined;
  forecast: SolarForecastResponse | undefined;
  loading: boolean;
}

export function HistoryVsForecastChart({ generation, forecast, loading }: Props) {
  if (loading) {
    return <article className="card wide">Carregando gráfico solar...</article>;
  }

  const history = (generation?.items ?? []).map((item) => ({
    timestamp: item.timestamp,
    label: new Date(item.timestamp).toLocaleString(),
    historico: item.generationMw
  }));
  const predicted = (forecast?.items ?? []).map((item) => ({
    timestamp: item.timestamp,
    label: new Date(item.timestamp).toLocaleString(),
    previsao: item.predGenerationMw,
    p10: item.p10GenerationMw,
    p90: item.p90GenerationMw
  }));

  const merged = [...history, ...predicted].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  if (merged.length === 0) {
    return <article className="card wide">Sem dados de geração/previsão para exibir.</article>;
  }

  return (
    <article className="card wide">
      <h2>Histórico vs Previsão</h2>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={merged}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" minTickGap={24} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="historico" name="Histórico (MW)" stroke="#0f4c81" dot={false} />
            <Area type="monotone" dataKey="p10" name="P10" stroke="#9ecae1" fill="#dceef9" />
            <Area type="monotone" dataKey="p90" name="P90" stroke="#9ecae1" fill="#dceef9" />
            <Line type="monotone" dataKey="previsao" name="Previsão (MW)" stroke="#f57c00" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
