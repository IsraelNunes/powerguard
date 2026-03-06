import {
  ReferenceLine,
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
  installedCapacityMw?: number;
  loading: boolean;
}

export function HistoryVsForecastChart({
  generation,
  forecast,
  installedCapacityMw,
  loading
}: Props) {
  if (loading) {
    return <article className="card wide">Carregando gráfico solar...</article>;
  }

  const historyItems = generation?.items ?? [];
  const hourBuckets = new Map<number, { sum: number; count: number }>();
  for (const item of historyItems) {
    const hour = new Date(item.timestamp).getHours();
    const bucket = hourBuckets.get(hour) ?? { sum: 0, count: 0 };
    bucket.sum += item.generationMw;
    bucket.count += 1;
    hourBuckets.set(hour, bucket);
  }
  const hourBaseline = new Map<number, number>();
  for (let hour = 0; hour < 24; hour += 1) {
    const bucket = hourBuckets.get(hour);
    hourBaseline.set(hour, bucket && bucket.count > 0 ? bucket.sum / bucket.count : 0);
  }

  const historySeries = historyItems.map((item) => {
    const hour = new Date(item.timestamp).getHours();
    return {
      timestamp: item.timestamp,
      label: new Date(item.timestamp).toLocaleString(),
      geracao: item.generationMw,
      perfilEsperado: Number((hourBaseline.get(hour) ?? 0).toFixed(2))
    };
  });

  const profileSeries = Array.from({ length: 24 }, (_, hour) => ({
    hora: `${String(hour).padStart(2, '0')}:00`,
    perfilEsperado: Number((hourBaseline.get(hour) ?? 0).toFixed(2))
  }));

  const forecastSeries = (forecast?.items ?? []).map((item) => {
    const hour = new Date(item.timestamp).getHours();
    return {
      timestamp: item.timestamp,
      label: new Date(item.timestamp).toLocaleString(),
      previsaoMw: item.predGenerationMw,
      p10: item.p10GenerationMw,
      p90: item.p90GenerationMw,
      perfilEsperado: Number((hourBaseline.get(hour) ?? item.predGenerationMw).toFixed(2))
    };
  });

  if (historySeries.length === 0 && forecastSeries.length === 0) {
    return <article className="card wide">Sem dados de geração/previsão para exibir.</article>;
  }

  return (
    <>
      <article className="card">
        <h2>Histórico de Geração</h2>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={historySeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" minTickGap={24} />
              <YAxis />
              <Tooltip />
              <Legend />
              {typeof installedCapacityMw === 'number' ? (
                <ReferenceLine
                  y={installedCapacityMw}
                  label="Capacidade (MW)"
                  stroke="#7b1fa2"
                  strokeDasharray="6 6"
                />
              ) : null}
              <Line type="monotone" dataKey="geracao" name="Histórico (MW)" stroke="#0f4c81" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="card">
        <h2>Perfil Esperado (Média por Hora)</h2>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={profileSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hora" />
              <YAxis />
              <Tooltip />
              <Legend />
              {typeof installedCapacityMw === 'number' ? (
                <ReferenceLine
                  y={installedCapacityMw}
                  label="Capacidade (MW)"
                  stroke="#7b1fa2"
                  strokeDasharray="6 6"
                />
              ) : null}
              <Line
                type="monotone"
                dataKey="perfilEsperado"
                name="Perfil Esperado (MW)"
                stroke="#6d4c41"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="card">
        <h2>Previsão de Geração</h2>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={forecastSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" minTickGap={24} />
              <YAxis />
              <Tooltip />
              <Legend />
              {typeof installedCapacityMw === 'number' ? (
                <ReferenceLine
                  y={installedCapacityMw}
                  label="Capacidade (MW)"
                  stroke="#7b1fa2"
                  strokeDasharray="6 6"
                />
              ) : null}
              <Area type="monotone" dataKey="p10" name="P10" stroke="#9ecae1" fill="#dceef9" />
              <Area type="monotone" dataKey="p90" name="P90" stroke="#9ecae1" fill="#dceef9" />
              <Line
                type="monotone"
                dataKey="perfilEsperado"
                name="Perfil Esperado (MW)"
                stroke="#6d4c41"
                strokeDasharray="4 4"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="previsaoMw"
                name="Previsão (MW)"
                stroke="#f57c00"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>
    </>
  );
}
