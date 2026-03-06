import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface PlantSeed {
  name: string;
  onsPlantCode: string;
  latitude: number;
  longitude: number;
  installedCapacityMw: number;
  timezone: string;
}

interface WeatherPoint {
  timestampUtc: Date;
  ghiWm2: number | null;
  tempC: number | null;
  windSpeedMs: number | null;
  source: string;
}

const SEED_PLANTS: PlantSeed[] = [
  {
    name: 'Spin Solar Pirapora',
    onsPlantCode: 'ONS-SPIN-001',
    latitude: -17.3464,
    longitude: -44.9411,
    installedCapacityMw: 95,
    timezone: 'America/Sao_Paulo'
  },
  {
    name: 'Spin Solar Juazeiro',
    onsPlantCode: 'ONS-SPIN-002',
    latitude: -9.4167,
    longitude: -40.5038,
    installedCapacityMw: 120,
    timezone: 'America/Sao_Paulo'
  },
  {
    name: 'Spin Solar Bom Jesus',
    onsPlantCode: 'ONS-SPIN-003',
    latitude: -13.2550,
    longitude: -43.4081,
    installedCapacityMw: 80,
    timezone: 'America/Sao_Paulo'
  }
];

function toUtcHour(date: Date): Date {
  const out = new Date(date);
  out.setUTCMinutes(0, 0, 0);
  return out;
}

function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const txt = String(raw).trim();
  if (!txt) return null;
  const num = Number(txt.replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function daySolarFactor(hourUtc: number): number {
  const localHour = (hourUtc - 3 + 24) % 24;
  const normalized = (localHour - 6) / 12;
  return Math.max(0, Math.sin(Math.PI * normalized));
}

async function fetchInmetWeather(plant: PlantSeed, start: Date, end: Date): Promise<WeatherPoint[]> {
  const baseUrl = process.env.INMET_BASE_URL ?? 'https://apitempo.inmet.gov.br';
  const token = process.env.INMET_TOKEN;
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'spin-guard-seed/1.0'
  };

  const stationsResponse = await fetch(`${baseUrl}/estacoes/T`, { headers });
  if (!stationsResponse.ok) return [];

  const stationsRaw = (await stationsResponse.json()) as Array<{
    CD_ESTACAO?: string;
    VL_LATITUDE?: string;
    VL_LONGITUDE?: string;
    TP_ESTACAO?: string;
  }>;

  const stations = stationsRaw
    .filter((s) => (s.TP_ESTACAO ?? '').toUpperCase().startsWith('A'))
    .map((s) => ({
      code: s.CD_ESTACAO ?? '',
      lat: parseNumber(s.VL_LATITUDE),
      lon: parseNumber(s.VL_LONGITUDE)
    }))
    .filter((s) => Boolean(s.code) && s.lat != null && s.lon != null)
    .map((s) => ({
      code: s.code,
      lat: s.lat as number,
      lon: s.lon as number,
      distanceKm: haversineKm(plant.latitude, plant.longitude, s.lat as number, s.lon as number)
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 4);

  if (stations.length === 0) return [];

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  for (const station of stations) {
    let dataResponse = await fetch(`${baseUrl}/estacao/${startDate}/${endDate}/${station.code}`, {
      headers
    });

    if (!dataResponse.ok && token) {
      dataResponse = await fetch(
        `${baseUrl}/token/estacao/${startDate}/${endDate}/${station.code}/${token}`,
        { headers }
      );
    }

    if (!dataResponse.ok) continue;

    const text = await dataResponse.text();
    if (!text || text.trim().length === 0 || text.toLowerCase().includes('limite de requisi')) continue;

    let payload: unknown = null;
    try {
      payload = JSON.parse(text);
    } catch {
      continue;
    }
    if (!Array.isArray(payload)) continue;

    const parsed: WeatherPoint[] = [];
    for (const row of payload as Array<{
      DT_MEDICAO?: string;
      HR_MEDICAO?: string;
      RAD_GLO?: string;
      TEM_INS?: string;
      TEMP_INS?: string;
      VEN_VEL?: string;
    }>) {
      const datePart = row.DT_MEDICAO?.trim();
      const hourPart = row.HR_MEDICAO?.trim();
      if (!datePart || !hourPart) continue;

      const hour = hourPart.padStart(4, '0').slice(0, 2);
      const timestampUtc = new Date(`${datePart}T${hour}:00:00Z`);
      if (Number.isNaN(timestampUtc.getTime())) continue;

      parsed.push({
        timestampUtc: toUtcHour(timestampUtc),
        ghiWm2: parseNumber(row.RAD_GLO),
        tempC: parseNumber(row.TEM_INS ?? row.TEMP_INS),
        windSpeedMs: parseNumber(row.VEN_VEL),
        source: 'INMET_API'
      });
    }

    if (parsed.length > 0) {
      const dedup = new Map<string, WeatherPoint>();
      for (const item of parsed) dedup.set(item.timestampUtc.toISOString(), item);
      return [...dedup.values()].sort((a, b) => a.timestampUtc.getTime() - b.timestampUtc.getTime());
    }
  }

  return [];
}

function generateSyntheticWeather(plant: PlantSeed, hours: number, end: Date): WeatherPoint[] {
  const rows: WeatherPoint[] = [];
  for (let h = hours - 1; h >= 0; h -= 1) {
    const timestampUtc = toUtcHour(new Date(end.getTime() - h * 60 * 60 * 1000));
    const solarFactor = daySolarFactor(timestampUtc.getUTCHours());
    const dayKey = timestampUtc.toISOString().slice(0, 10);
    const dayNoise = (Math.abs(Math.sin(dayKey.length * 37 + h * 0.13)) % 1) * 0.2;
    const cloudCoverPct = Math.min(100, Math.max(0, (1 - solarFactor) * 55 + dayNoise * 100));
    const ghiWm2 = Number((Math.max(0, solarFactor) * (980 - cloudCoverPct * 2.4)).toFixed(2));
    const tempC = Number((21 + solarFactor * 12 + dayNoise * 5).toFixed(2));
    const windSpeedMs = Number((1.5 + (1 - solarFactor) * 3.5 + dayNoise).toFixed(2));

    rows.push({
      timestampUtc,
      ghiWm2,
      tempC,
      windSpeedMs,
      source: 'INMET_SYNTH'
    });
  }

  if (rows.length > 400) {
    const eventStart = Math.floor(rows.length * 0.55);
    for (let i = eventStart; i < Math.min(eventStart + 24, rows.length); i += 1) {
      rows[i].ghiWm2 = Number(((rows[i].ghiWm2 ?? 0) * 0.35).toFixed(2));
      rows[i].tempC = Number(((rows[i].tempC ?? 25) + 2.8).toFixed(2));
    }
  }

  return rows;
}

async function seedSolarPlant(plant: PlantSeed) {
  const createdPlant = await prisma.solarPlant.create({
    data: {
      name: plant.name,
      onsPlantCode: plant.onsPlantCode,
      latitude: plant.latitude,
      longitude: plant.longitude,
      installedCapacityMw: plant.installedCapacityMw,
      timezone: plant.timezone,
      isActive: true
    }
  });

  const nowHour = toUtcHour(new Date());
  const historyHours = 24 * 30;
  const start = new Date(nowHour.getTime() - historyHours * 60 * 60 * 1000);
  const inmetWeather = await fetchInmetWeather(plant, start, nowHour).catch(() => []);
  const weatherRows =
    inmetWeather.length >= 72 ? inmetWeather : generateSyntheticWeather(plant, historyHours, nowHour);

  await prisma.solarWeatherHourly.createMany({
    data: weatherRows.map((row) => ({
      plantId: createdPlant.id,
      timestampUtc: row.timestampUtc,
      ghiWm2: row.ghiWm2,
      dniWm2: null,
      dhiWm2: null,
      tempC: row.tempC,
      cloudCoverPct: null,
      windSpeedMs: row.windSpeedMs,
      source: row.source,
      qualityFlag: 'OK'
    })),
    skipDuplicates: true
  });

  const generationRows = weatherRows.map((row, index) => {
    const hour = row.timestampUtc.getUTCHours();
    const solarFactor = daySolarFactor(hour);
    const ghi = row.ghiWm2 ?? 0;
    const temp = row.tempC ?? 25;
    const tempDerate = 1 - Math.max(0, temp - 25) * 0.0045;
    const noise = (Math.sin(index * 0.73) + Math.cos(index * 0.19)) * 0.015;
    const baseMw =
      plant.installedCapacityMw * Math.max(0, Math.min(1, (ghi / 1000) * 0.92 * tempDerate + noise));
    const anomalyDrop = index % 167 === 0 || index % 199 === 0 ? 0.52 : 1;
    const generationMw = Number((Math.max(0, baseMw * anomalyDrop * (solarFactor > 0 ? 1 : 0.2))).toFixed(3));
    const capacityFactor = Number((Math.min(1, generationMw / plant.installedCapacityMw)).toFixed(4));

    return {
      plantId: createdPlant.id,
      timestampUtc: row.timestampUtc,
      generationMw,
      capacityFactor,
      source: row.source,
      qualityFlag: 'OK'
    };
  });

  await prisma.solarGenerationHourly.createMany({
    data: generationRows,
    skipDuplicates: true
  });

  const model = await prisma.solarModelVersion.create({
    data: {
      plantId: createdPlant.id,
      version: 'seed-v2.0',
      algorithm: 'RIDGE_REGRESSION_LAGS',
      featuresJson: ['lag1', 'lag24', 'sin_hour', 'cos_hour', 'ghiWm2', 'tempC', 'windSpeedMs'],
      hyperparamsJson: {
        lambda: 0.08,
        learningRate: 0.04,
        epochs: 800
      },
      metricsJson: {
        mae: 1.8,
        rmse: 2.7,
        mape: 9.4,
        trainPoints: generationRows.length,
        testPoints: Math.floor(generationRows.length * 0.2)
      },
      trainWindowStart: start,
      trainWindowEnd: nowHour,
      isActive: true,
      artifactJson: {
        mode: 'SEED_MODEL',
        notes: 'Modelo seed para demo do Spin Forecast'
      }
    }
  });

  const runAt = nowHour;
  const forecastRows = Array.from({ length: 24 * 30 }, (_, i) => {
    const horizonHours = i + 1;
    const targetTimestampUtc = new Date(runAt.getTime() + horizonHours * 60 * 60 * 1000);
    const hour = targetTimestampUtc.getUTCHours();
    const solarFactor = daySolarFactor(hour);
    const weekday = targetTimestampUtc.getUTCDay();
    const weekdayFactor = weekday === 0 ? 0.94 : weekday === 6 ? 0.96 : 1;
    const predGenerationMw = Number((plant.installedCapacityMw * solarFactor * 0.76 * weekdayFactor).toFixed(3));
    const predCapacityFactor = Number((predGenerationMw / plant.installedCapacityMw).toFixed(4));
    const p10GenerationMw = Number((Math.max(0, predGenerationMw * 0.78)).toFixed(3));
    const p90GenerationMw = Number((Math.min(plant.installedCapacityMw, predGenerationMw * 1.22)).toFixed(3));

    return {
      plantId: createdPlant.id,
      modelVersionId: model.id,
      forecastRunAt: runAt,
      targetTimestampUtc,
      horizonHours,
      predGenerationMw,
      predCapacityFactor,
      p10GenerationMw,
      p50GenerationMw: predGenerationMw,
      p90GenerationMw
    };
  });

  await prisma.solarForecast.createMany({
    data: forecastRows,
    skipDuplicates: true
  });

  // eslint-disable-next-line no-console
  console.log(
    `[seed] ${plant.name} | weather=${weatherRows.length} (${weatherRows[0]?.source ?? '-'}) | generation=${generationRows.length} | forecast=${forecastRows.length}`
  );
}

async function main() {
  await prisma.solarForecast.deleteMany();
  await prisma.solarTrainingJob.deleteMany();
  await prisma.solarModelVersion.deleteMany();
  await prisma.solarWeatherHourly.deleteMany();
  await prisma.solarGenerationHourly.deleteMany();
  await prisma.solarPlant.deleteMany();

  for (const plant of SEED_PLANTS) {
    await seedSolarPlant(plant);
  }

  await prisma.equipment.upsert({
    where: { id: 'seed-eq-001' },
    update: {},
    create: {
      id: 'seed-eq-001',
      name: 'Main Transformer T1'
    }
  });

  // eslint-disable-next-line no-console
  console.log('[seed] Spin Guard solar seed concluido com 3 usinas.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
