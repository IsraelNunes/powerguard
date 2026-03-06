import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { SolarDashboardSummaryResponse, SolarForecastResponse, SolarGenerationResponse } from '../types/solar';

interface Props {
  summary: SolarDashboardSummaryResponse | undefined;
  generation: SolarGenerationResponse | undefined;
  forecast: SolarForecastResponse | undefined;
  loading: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(value);
}

export function SolarFinancialCharts({ summary, generation, forecast, loading }: Props) {
  if (loading) {
    return <article className="card wide">Carregando gráficos financeiros...</article>;
  }

  const forecastItems = forecast?.items ?? [];
  const historyItems = generation?.items ?? [];
  const pricePerMwhBrl = summary?.financial.pricePerMwhBrl ?? 650;

  if (forecastItems.length === 0) {
    return <article className="card wide">Rode uma previsão para visualizar gráficos financeiros.</article>;
  }

  const buckets = new Map<number, { sum: number; count: number }>();
  for (const item of historyItems) {
    const hour = new Date(item.timestamp).getHours();
    const bucket = buckets.get(hour) ?? { sum: 0, count: 0 };
    bucket.sum += item.generationMw;
    bucket.count += 1;
    buckets.set(hour, bucket);
  }

  const baselineByHour = new Map<number, number>();
  for (let hour = 0; hour < 24; hour += 1) {
    const bucket = buckets.get(hour);
    baselineByHour.set(hour, bucket && bucket.count > 0 ? bucket.sum / bucket.count : 0);
  }

  let accumulatedLoss = 0;
  const revenueSeries = forecastItems.map((item) => {
    const hour = new Date(item.timestamp).getHours();
    const expectedMw = baselineByHour.get(hour) ?? item.predGenerationMw;
    const expectedRevenue = expectedMw * pricePerMwhBrl;
    const forecastRevenue = item.predGenerationMw * pricePerMwhBrl;
    const hourlyLoss = Math.max(0, expectedRevenue - forecastRevenue);
    accumulatedLoss += hourlyLoss;

    return {
      label: new Date(item.timestamp).toLocaleString(),
      receitaEsperada: Number(expectedRevenue.toFixed(2)),
      receitaPrevista: Number(forecastRevenue.toFixed(2)),
      perdaHora: Number(hourlyLoss.toFixed(2)),
      perdaAcumulada: Number(accumulatedLoss.toFixed(2))
    };
  });

  const gapPercent = summary?.financial.expectedEnergyMwh24h
    ? Number(
        (
          (summary.financial.energyGapMwh24h / Math.max(summary.financial.expectedEnergyMwh24h, 0.001)) *
          100
        ).toFixed(2)
      )
    : 0;

  const sensitivitySeries = [-20, -10, 0, 10, 20].map((variation) => {
    const scenarioExpected =
      (summary?.financial.expectedEnergyMwh24h ?? 0) * (1 + variation / 100);
    const scenarioLoss = Math.max(0, (summary?.financial.expectedEnergyMwh24h ?? 0) - scenarioExpected);
    return {
      cenario: `${variation > 0 ? '+' : ''}${variation}%`,
      perdaBrl: Number((scenarioLoss * pricePerMwhBrl).toFixed(2))
    };
  });

  return (
    <>
      <article className="card">
        <h2>Financeiro: Receita Esperada vs Prevista</h2>
        <p className="muted">
          Tarifa usada: {formatCurrency(pricePerMwhBrl)}/MWh | Gap energético: {gapPercent}%
        </p>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={revenueSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" minTickGap={24} />
              <YAxis tickFormatter={(value) => `R$ ${Math.round(value / 1000)}k`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Line
                type="monotone"
                dataKey="receitaEsperada"
                name="Receita Esperada"
                stroke="#1565c0"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="receitaPrevista"
                name="Receita Prevista"
                stroke="#f57c00"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="card">
        <h2>Financeiro: Perda por Hora e Acumulada</h2>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={revenueSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" minTickGap={24} />
              <YAxis tickFormatter={(value) => `R$ ${Math.round(value / 1000)}k`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="perdaHora" name="Perda por Hora" fill="#d32f2f" />
              <Line
                type="monotone"
                dataKey="perdaAcumulada"
                name="Perda Acumulada"
                stroke="#6a1b9a"
                dot={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="card">
        <h2>Sensibilidade de Perda (Cenários)</h2>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={sensitivitySeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="cenario" />
              <YAxis tickFormatter={(value) => `R$ ${Math.round(value / 1000)}k`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar dataKey="perdaBrl" name="Perda estimada" fill="#8e24aa" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
    </>
  );
}
