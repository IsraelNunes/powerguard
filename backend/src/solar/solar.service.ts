import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common';
import { EventSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseGenerationCsv } from './csv-generation.util';
import { parseWeatherCsv } from './csv-weather.util';
import { CreateSolarPlantDto } from './dto/create-solar-plant.dto';
import { IngestSolarGenerationDto } from './dto/ingest-solar-generation.dto';
import { IngestSolarWeatherDto } from './dto/ingest-solar-weather.dto';
import { IngestSolarWeatherInmetDto } from './dto/ingest-solar-weather-inmet.dto';
import { GetSolarForecastDto } from './dto/get-solar-forecast.dto';
import { ListSolarModelsDto } from './dto/list-solar-models.dto';
import { QuerySolarGenerationDto } from './dto/query-solar-generation.dto';
import { RunSolarForecastDto } from './dto/run-solar-forecast.dto';
import { SolarDashboardSummaryDto } from './dto/solar-dashboard-summary.dto';
import { StartSolarTrainingDto } from './dto/start-solar-training.dto';
import { SyncSolarAlertsDto } from './dto/sync-solar-alerts.dto';

export interface SolarPlantRow {
  id: string;
  name: string;
  onsPlantCode: string | null;
  latitude: number | null;
  longitude: number | null;
  installedCapacityMw: number;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface SolarWeatherRow {
  timestampUtc: Date;
}

interface WeatherInputRow {
  timestamp: Date;
  ghiWm2: number | null;
  dniWm2: number | null;
  dhiWm2: number | null;
  tempC: number | null;
  cloudCoverPct: number | null;
  windSpeedMs: number | null;
}

interface InmetStationRow {
  CD_ESTACAO?: string;
  VL_LATITUDE?: string;
  VL_LONGITUDE?: string;
  SG_ESTADO?: string;
  TP_ESTACAO?: string;
  DC_NOME?: string;
}

interface InmetMeasurementRow {
  DT_MEDICAO?: string;
  HR_MEDICAO?: string;
  TEM_INS?: string;
  TEMP_INS?: string;
  RAD_GLO?: string;
  VEN_VEL?: string;
  VEN_DIR?: string;
  UMD_INS?: string;
  CHUVA?: string;
}

interface SolarTrainingJobRow {
  id: string;
  plantId: string;
  status: string;
  paramsJson: unknown;
  metricsJson: unknown | null;
  modelVersionId: string | null;
  requestedBy: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SolarModelVersionRow {
  id: string;
  plantId: string;
  version: string;
  algorithm: string;
  featuresJson: unknown;
  hyperparamsJson: unknown;
  metricsJson: unknown;
  trainWindowStart: Date;
  trainWindowEnd: Date;
  isActive: boolean;
  artifactJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface SolarForecastRow {
  id: string;
  plantId: string;
  modelVersionId: string;
  forecastRunAt: Date;
  targetTimestampUtc: Date;
  horizonHours: number;
  predGenerationMw: number;
  predCapacityFactor: number;
  p10GenerationMw: number | null;
  p50GenerationMw: number | null;
  p90GenerationMw: number | null;
}

interface SolarGenerationPointRow {
  timestampUtc: Date;
  generationMw: number;
  capacityFactor: number | null;
}

interface SolarTrainRow {
  timestampUtc: Date;
  generationMw: number;
  ghiWm2: number | null;
  tempC: number | null;
  windSpeedMs: number | null;
}

@Injectable()
export class SolarService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SolarService.name);
  private workerHandle: NodeJS.Timeout | null = null;
  private workerBusy = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.workerHandle = setInterval(() => {
      void this.processPendingTrainingJob();
    }, 5000);
  }

  onModuleDestroy() {
    if (this.workerHandle) {
      clearInterval(this.workerHandle);
      this.workerHandle = null;
    }
  }

  private normalizeHourUtc(date: Date): Date {
    const normalized = new Date(date);
    normalized.setUTCMinutes(0, 0, 0);
    return normalized;
  }

  private buildId(prefix: string) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private parseNumber(raw: unknown): number | null {
    if (raw == null) return null;
    const text = String(raw).trim();
    if (!text) return null;
    const normalized = text.replace(',', '.');
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }

  private dot(a: number[], b: number[]): number {
    let out = 0;
    for (let i = 0; i < a.length; i += 1) out += a[i] * b[i];
    return out;
  }

  private trainRidgeGradientDescent(
    X: number[][],
    y: number[],
    options?: { lambda?: number; learningRate?: number; epochs?: number }
  ) {
    const lambda = options?.lambda ?? 0.08;
    const learningRate = options?.learningRate ?? 0.04;
    const epochs = options?.epochs ?? 800;
    const n = X.length;
    const p = X[0].length;
    const w = new Array<number>(p).fill(0);

    for (let epoch = 0; epoch < epochs; epoch += 1) {
      const gradients = new Array<number>(p).fill(0);
      for (let i = 0; i < n; i += 1) {
        const err = this.dot(w, X[i]) - y[i];
        for (let j = 0; j < p; j += 1) {
          gradients[j] += (2 / n) * err * X[i][j];
        }
      }

      for (let j = 1; j < p; j += 1) {
        gradients[j] += 2 * lambda * w[j];
      }
      for (let j = 0; j < p; j += 1) {
        w[j] -= learningRate * gradients[j];
      }
    }

    return w;
  }

  private async upsertWeatherRows(params: {
    plantId: string;
    source: string;
    rows: WeatherInputRow[];
  }) {
    const { plantId, source } = params;
    const uniqueByHour = new Map<
      string,
      {
        timestampUtc: Date;
        ghiWm2: number | null;
        dniWm2: number | null;
        dhiWm2: number | null;
        tempC: number | null;
        cloudCoverPct: number | null;
        windSpeedMs: number | null;
        qualityFlag: string;
      }
    >();
    let rowsRejected = 0;

    for (const row of params.rows) {
      const timestampUtc = this.normalizeHourUtc(row.timestamp);
      const normalizeNonNegative = (value: number | null) =>
        value == null ? null : Math.max(0, Number(value.toFixed(3)));

      const ghiWm2 = normalizeNonNegative(row.ghiWm2);
      const dniWm2 = normalizeNonNegative(row.dniWm2);
      const dhiWm2 = normalizeNonNegative(row.dhiWm2);
      const tempC = row.tempC == null ? null : Number(row.tempC.toFixed(3));
      const cloudCoverPct =
        row.cloudCoverPct == null ? null : Math.max(0, Math.min(100, Number(row.cloudCoverPct.toFixed(3))));
      const windSpeedMs = normalizeNonNegative(row.windSpeedMs);

      if (
        ghiWm2 == null &&
        dniWm2 == null &&
        dhiWm2 == null &&
        tempC == null &&
        cloudCoverPct == null &&
        windSpeedMs == null
      ) {
        rowsRejected += 1;
        continue;
      }

      uniqueByHour.set(timestampUtc.toISOString(), {
        timestampUtc,
        ghiWm2,
        dniWm2,
        dhiWm2,
        tempC,
        cloudCoverPct,
        windSpeedMs,
        qualityFlag: 'OK'
      });
    }

    const normalizedRows = [...uniqueByHour.values()].sort(
      (a, b) => a.timestampUtc.getTime() - b.timestampUtc.getTime()
    );

    if (normalizedRows.length === 0) {
      throw new BadRequestException('no rows remaining after normalization');
    }

    const minTs = normalizedRows[0].timestampUtc;
    const maxTs = normalizedRows[normalizedRows.length - 1].timestampUtc;

    const existingRows = await this.prisma.$queryRaw<SolarWeatherRow[]>`
      SELECT timestamp_utc AS "timestampUtc"
      FROM solar_weather_hourly
      WHERE plant_id = ${plantId}
        AND timestamp_utc >= ${minTs}
        AND timestamp_utc <= ${maxTs}
    `;
    const existingSet = new Set(existingRows.map((row) => new Date(row.timestampUtc).toISOString()));

    let rowsInserted = 0;
    let rowsUpdated = 0;

    for (const row of normalizedRows) {
      const tsIso = row.timestampUtc.toISOString();
      if (existingSet.has(tsIso)) {
        await this.prisma.$executeRaw`
          UPDATE solar_weather_hourly
          SET
            ghi_wm2 = ${row.ghiWm2},
            dni_wm2 = ${row.dniWm2},
            dhi_wm2 = ${row.dhiWm2},
            temp_c = ${row.tempC},
            cloud_cover_pct = ${row.cloudCoverPct},
            wind_speed_ms = ${row.windSpeedMs},
            source = ${source},
            quality_flag = ${row.qualityFlag},
            updated_at = NOW()
          WHERE plant_id = ${plantId}
            AND timestamp_utc = ${row.timestampUtc}
        `;
        rowsUpdated += 1;
      } else {
        await this.prisma.$executeRaw`
          INSERT INTO solar_weather_hourly (
            id,
            plant_id,
            timestamp_utc,
            ghi_wm2,
            dni_wm2,
            dhi_wm2,
            temp_c,
            cloud_cover_pct,
            wind_speed_ms,
            source,
            quality_flag,
            updated_at
          )
          VALUES (
            ${this.buildId('sw')},
            ${plantId},
            ${row.timestampUtc},
            ${row.ghiWm2},
            ${row.dniWm2},
            ${row.dhiWm2},
            ${row.tempC},
            ${row.cloudCoverPct},
            ${row.windSpeedMs},
            ${source},
            ${row.qualityFlag},
            NOW()
          )
        `;
        rowsInserted += 1;
      }
    }

    return {
      source,
      rowsReceived: params.rows.length,
      rowsInserted,
      rowsUpdated,
      rowsRejected,
      from: normalizedRows[0].timestampUtc.toISOString(),
      to: normalizedRows[normalizedRows.length - 1].timestampUtc.toISOString()
    };
  }

  private haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private parseJsonField<T>(value: unknown, fallback: T): T {
    if (value == null) return fallback;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return fallback;
      }
    }
    return value as T;
  }

  private severityFromRisk(amplifiedRisk: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (amplifiedRisk >= 75) return 'CRITICAL';
    if (amplifiedRisk >= 50) return 'HIGH';
    if (amplifiedRisk >= 25) return 'MEDIUM';
    return 'LOW';
  }

  private async getPlantOrFail(plantId: string) {
    const plantRows = await this.prisma.$queryRaw<SolarPlantRow[]>`
      SELECT
        id,
        name,
        ons_plant_code AS "onsPlantCode",
        latitude,
        longitude,
        installed_capacity_mw AS "installedCapacityMw",
        timezone,
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM solar_plant
      WHERE id = ${plantId}
      LIMIT 1
    `;
    const plant = plantRows[0];
    if (!plant) {
      throw new NotFoundException(`plantId not found: ${plantId}`);
    }
    return plant;
  }

  private async getActiveModelOrFail(plantId: string) {
    const rows = await this.prisma.$queryRaw<SolarModelVersionRow[]>`
      SELECT
        id,
        plant_id AS "plantId",
        version,
        algorithm,
        features_json AS "featuresJson",
        hyperparams_json AS "hyperparamsJson",
        metrics_json AS "metricsJson",
        train_window_start AS "trainWindowStart",
        train_window_end AS "trainWindowEnd",
        is_active AS "isActive",
        artifact_json AS "artifactJson",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM solar_model_version
      WHERE plant_id = ${plantId}
        AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const model = rows[0];
    if (!model) {
      throw new NotFoundException(`no active model found for plantId: ${plantId}`);
    }
    return model;
  }

  async upsertPlant(payload: CreateSolarPlantDto) {
    const existing = await this.prisma.$queryRaw<SolarPlantRow[]>`
      SELECT
        id,
        name,
        ons_plant_code AS "onsPlantCode",
        latitude,
        longitude,
        installed_capacity_mw AS "installedCapacityMw",
        timezone,
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM solar_plant
      WHERE name = ${payload.name}
      LIMIT 1
    `;

    if (existing[0]) {
      const updated = await this.prisma.$queryRaw<SolarPlantRow[]>`
        UPDATE solar_plant
        SET
          ons_plant_code = ${payload.onsPlantCode ?? existing[0].onsPlantCode},
          latitude = ${payload.latitude ?? existing[0].latitude},
          longitude = ${payload.longitude ?? existing[0].longitude},
          installed_capacity_mw = ${payload.installedCapacityMw},
          timezone = ${payload.timezone ?? existing[0].timezone},
          is_active = ${payload.isActive ?? existing[0].isActive},
          updated_at = NOW()
        WHERE id = ${existing[0].id}
        RETURNING
          id,
          name,
          ons_plant_code AS "onsPlantCode",
          latitude,
          longitude,
          installed_capacity_mw AS "installedCapacityMw",
          timezone,
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `;
      return updated[0];
    }

    const plantId = this.buildId('slr');
    const inserted = await this.prisma.$queryRaw<SolarPlantRow[]>`
      INSERT INTO solar_plant (
        id,
        name,
        ons_plant_code,
        latitude,
        longitude,
        installed_capacity_mw,
        timezone,
        is_active,
        updated_at
      )
      VALUES (
        ${plantId},
        ${payload.name},
        ${payload.onsPlantCode ?? null},
        ${payload.latitude ?? null},
        ${payload.longitude ?? null},
        ${payload.installedCapacityMw},
        ${payload.timezone ?? 'America/Sao_Paulo'},
        ${payload.isActive ?? true},
        NOW()
      )
      RETURNING
        id,
        name,
        ons_plant_code AS "onsPlantCode",
        latitude,
        longitude,
        installed_capacity_mw AS "installedCapacityMw",
        timezone,
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;

    return inserted[0];
  }

  async ingestGenerationCsv(fileBuffer: Buffer, payload: IngestSolarGenerationDto) {
    const plantRows = await this.prisma.$queryRaw<SolarPlantRow[]>`
      SELECT
        id,
        name,
        ons_plant_code AS "onsPlantCode",
        latitude,
        longitude,
        installed_capacity_mw AS "installedCapacityMw",
        timezone,
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM solar_plant
      WHERE id = ${payload.plantId}
      LIMIT 1
    `;
    const plant = plantRows[0];

    if (!plant) {
      throw new NotFoundException(`plantId not found: ${payload.plantId}`);
    }

    const source = payload.source ?? 'ONS_CSV';
    const content = fileBuffer.toString('utf-8');
    const parsed = parseGenerationCsv(content);

    if (parsed.errors.length > 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: parsed.errors.slice(0, 30)
      });
    }

    if (parsed.rows.length === 0) {
      throw new BadRequestException('no valid rows found in csv');
    }

    const uniqueByHour = new Map<
      string,
      { timestampUtc: Date; generationMw: number; capacityFactor: number | null; qualityFlag: string }
    >();
    let rowsRejected = 0;

    for (const row of parsed.rows) {
      const timestampUtc = this.normalizeHourUtc(row.timestamp);
      let generationMw = row.generationMw;
      let qualityFlag = 'OK';

      if (generationMw < 0) {
        rowsRejected += 1;
        continue;
      }

      const maxAllowed = plant.installedCapacityMw * 1.2;
      if (generationMw > maxAllowed) {
        generationMw = maxAllowed;
        qualityFlag = 'OUTLIER_CLIPPED';
      }

      const computedCapacity = generationMw / plant.installedCapacityMw;
      let capacityFactor = row.capacityFactor ?? computedCapacity;
      if (!Number.isFinite(capacityFactor)) {
        capacityFactor = computedCapacity;
      }
      capacityFactor = Math.max(0, Math.min(1.2, Number(capacityFactor.toFixed(4))));

      uniqueByHour.set(timestampUtc.toISOString(), {
        timestampUtc,
        generationMw: Number(generationMw.toFixed(4)),
        capacityFactor,
        qualityFlag
      });
    }

    const normalizedRows = [...uniqueByHour.values()].sort(
      (a, b) => a.timestampUtc.getTime() - b.timestampUtc.getTime()
    );

    if (normalizedRows.length === 0) {
      throw new BadRequestException('no rows remaining after normalization');
    }

    const minTs = normalizedRows[0].timestampUtc;
    const maxTs = normalizedRows[normalizedRows.length - 1].timestampUtc;

    const existingRows = await this.prisma.$queryRaw<{ timestampUtc: Date }[]>`
      SELECT timestamp_utc AS "timestampUtc"
      FROM solar_generation_hourly
      WHERE plant_id = ${payload.plantId}
        AND timestamp_utc >= ${minTs}
        AND timestamp_utc <= ${maxTs}
    `;
    const existingSet = new Set(existingRows.map((row) => new Date(row.timestampUtc).toISOString()));

    let rowsInserted = 0;
    let rowsUpdated = 0;

    for (const row of normalizedRows) {
      const tsIso = row.timestampUtc.toISOString();
      if (existingSet.has(tsIso)) {
        await this.prisma.$executeRaw`
          UPDATE solar_generation_hourly
          SET
            generation_mw = ${row.generationMw},
            capacity_factor = ${row.capacityFactor},
            source = ${source},
            quality_flag = ${row.qualityFlag},
            updated_at = NOW()
          WHERE plant_id = ${payload.plantId}
            AND timestamp_utc = ${row.timestampUtc}
        `;
        rowsUpdated += 1;
      } else {
        await this.prisma.$executeRaw`
          INSERT INTO solar_generation_hourly (
            id,
            plant_id,
            timestamp_utc,
            generation_mw,
            capacity_factor,
            source,
            quality_flag,
            updated_at
          )
          VALUES (
            ${this.buildId('sg')},
            ${payload.plantId},
            ${row.timestampUtc},
            ${row.generationMw},
            ${row.capacityFactor},
            ${source},
            ${row.qualityFlag},
            NOW()
          )
        `;
        rowsInserted += 1;
      }
    }

    return {
      plantId: payload.plantId,
      source,
      rowsReceived: parsed.rows.length,
      rowsInserted,
      rowsUpdated,
      rowsRejected,
      from: normalizedRows[0].timestampUtc.toISOString(),
      to: normalizedRows[normalizedRows.length - 1].timestampUtc.toISOString()
    };
  }

  async ingestWeatherCsv(fileBuffer: Buffer, payload: IngestSolarWeatherDto) {
    await this.getPlantOrFail(payload.plantId);

    const source = payload.source ?? 'INMET';
    const content = fileBuffer.toString('utf-8');
    const parsed = parseWeatherCsv(content);

    if (parsed.errors.length > 0) {
      throw new BadRequestException({
        message: 'CSV validation failed',
        errors: parsed.errors.slice(0, 30)
      });
    }

    if (parsed.rows.length === 0) {
      throw new BadRequestException('no valid rows found in csv');
    }

    const upserted = await this.upsertWeatherRows({
      plantId: payload.plantId,
      source,
      rows: parsed.rows.map((row) => ({
        timestamp: row.timestamp,
        ghiWm2: row.ghiWm2,
        dniWm2: row.dniWm2,
        dhiWm2: row.dhiWm2,
        tempC: row.tempC,
        cloudCoverPct: row.cloudCoverPct,
        windSpeedMs: row.windSpeedMs
      }))
    });

    return {
      plantId: payload.plantId,
      ...upserted
    };
  }

  async ingestWeatherFromInmet(payload: IngestSolarWeatherInmetDto) {
    const plant = await this.getPlantOrFail(payload.plantId);
    const baseUrl = process.env.INMET_BASE_URL ?? 'https://apitempo.inmet.gov.br';
    const headers = {
      Accept: 'application/json',
      'User-Agent': 'powerguard-ai/1.0'
    };

    let stationCode = payload.stationCode;
    let candidateStations: string[] = [];
    if (!stationCode) {
      if (plant.latitude == null || plant.longitude == null) {
        throw new BadRequestException('plant must have latitude/longitude or stationCode must be provided');
      }

      const stationsRes = await fetch(`${baseUrl}/estacoes/T`, { headers });
      if (!stationsRes.ok) {
        throw new BadRequestException(`INMET station list failed: ${stationsRes.status}`);
      }
      const stations = (await stationsRes.json()) as InmetStationRow[];
      if (!Array.isArray(stations) || stations.length === 0) {
        throw new BadRequestException('INMET station list is empty');
      }

      const automatic = stations.filter((s) => (s.TP_ESTACAO ?? '').toUpperCase().startsWith('A'));
      const candidates = automatic.length > 0 ? automatic : stations;
      const ranked: Array<{ code: string; distanceKm: number }> = [];
      for (const station of candidates) {
        const code = station.CD_ESTACAO;
        const lat = this.parseNumber(station.VL_LATITUDE);
        const lon = this.parseNumber(station.VL_LONGITUDE);
        if (!code || lat == null || lon == null) continue;
        const distanceKm = this.haversineDistanceKm(plant.latitude, plant.longitude, lat, lon);
        ranked.push({ code, distanceKm });
      }
      ranked.sort((a, b) => a.distanceKm - b.distanceKm);
      candidateStations = ranked.slice(0, 6).map((item) => item.code);
      if (candidateStations.length === 0) {
        throw new BadRequestException('unable to resolve nearest INMET station');
      }
      stationCode = candidateStations[0];
    } else {
      candidateStations = [stationCode];
    }

    const start = payload.startDate.slice(0, 10);
    const end = payload.endDate.slice(0, 10);

    let measurements: InmetMeasurementRow[] = [];
    let selectedStation = stationCode;
    let lastStatus = 0;

    for (const code of candidateStations) {
      selectedStation = code;
      let dataRes = await fetch(`${baseUrl}/estacao/${start}/${end}/${code}`, { headers });
      if (!dataRes.ok && process.env.INMET_TOKEN) {
        dataRes = await fetch(`${baseUrl}/token/estacao/${start}/${end}/${code}/${process.env.INMET_TOKEN}`, {
          headers
        });
      }

      lastStatus = dataRes.status;
      if (dataRes.status === 204) continue;

      const raw = await dataRes.text();
      if (!raw || raw.trim().length === 0) continue;
      if (raw.toLowerCase().includes('limite de requisi')) {
        throw new HttpException(
          'INMET rate limit reached. Tente novamente em alguns minutos.',
          HttpStatus.TOO_MANY_REQUESTS
        );
      }

      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        measurements = parsed as InmetMeasurementRow[];
        break;
      }
    }

    if (measurements.length === 0) {
      throw new BadRequestException(
        `INMET returned no valid measurements for requested range (${start} to ${end}). Last status: ${lastStatus}`
      );
    }

    const rows: WeatherInputRow[] = [];
    for (const row of measurements) {
      const datePart = row.DT_MEDICAO?.trim();
      const hourPart = row.HR_MEDICAO?.trim();
      if (!datePart || !hourPart) continue;

      const normalizedHour = hourPart.padStart(4, '0').slice(0, 2);
      const timestamp = new Date(`${datePart}T${normalizedHour}:00:00Z`);
      if (Number.isNaN(timestamp.getTime())) continue;

      rows.push({
        timestamp,
        ghiWm2: this.parseNumber(row.RAD_GLO),
        dniWm2: null,
        dhiWm2: null,
        tempC: this.parseNumber(row.TEM_INS ?? row.TEMP_INS),
        cloudCoverPct: null,
        windSpeedMs: this.parseNumber(row.VEN_VEL)
      });
    }

    if (rows.length === 0) {
      throw new BadRequestException('INMET payload parsed with zero valid rows');
    }

    const upserted = await this.upsertWeatherRows({
      plantId: payload.plantId,
      source: 'INMET_API',
      rows
    });

    return {
      plantId: payload.plantId,
      stationCode: selectedStation,
      requestedWindow: { startDate: start, endDate: end },
      ...upserted
    };
  }

  async listPlants() {
    const items = await this.prisma.$queryRaw<SolarPlantRow[]>`
      SELECT
        id,
        name,
        ons_plant_code AS "onsPlantCode",
        latitude,
        longitude,
        installed_capacity_mw AS "installedCapacityMw",
        timezone,
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM solar_plant
      WHERE is_active = true
      ORDER BY created_at DESC
    `;

    return {
      count: items.length,
      items
    };
  }

  async getGeneration(query: QuerySolarGenerationDto) {
    await this.getPlantOrFail(query.plantId);
    const limit = query.limit ?? 500;
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    const rows = await this.prisma.$queryRaw<SolarGenerationPointRow[]>`
      SELECT
        timestamp_utc AS "timestampUtc",
        generation_mw AS "generationMw",
        capacity_factor AS "capacityFactor"
      FROM solar_generation_hourly
      WHERE plant_id = ${query.plantId}
        AND (${from}::timestamptz IS NULL OR timestamp_utc >= ${from})
        AND (${to}::timestamptz IS NULL OR timestamp_utc <= ${to})
      ORDER BY timestamp_utc DESC
      LIMIT ${limit}
    `;

    const items = [...rows].reverse();
    return {
      plantId: query.plantId,
      count: items.length,
      items: items.map((row) => ({
        timestamp: row.timestampUtc,
        generationMw: row.generationMw,
        capacityFactor: row.capacityFactor
      }))
    };
  }

  async startTraining(payload: StartSolarTrainingDto) {
    const plantRows = await this.prisma.$queryRaw<SolarPlantRow[]>`
      SELECT
        id,
        name,
        ons_plant_code AS "onsPlantCode",
        latitude,
        longitude,
        installed_capacity_mw AS "installedCapacityMw",
        timezone,
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM solar_plant
      WHERE id = ${payload.plantId}
      LIMIT 1
    `;
    const plant = plantRows[0];
    if (!plant) {
      throw new NotFoundException(`plantId not found: ${payload.plantId}`);
    }

    const algorithm = payload.algorithm ?? 'RIDGE_LAGS_CLIMATE_V2';
    const params = {
      trainWindowDays: payload.trainWindowDays ?? 365,
      algorithm,
      activateModel: payload.activateModel ?? true
    };

    const jobId = this.buildId('stj');
    const inserted = await this.prisma.$queryRaw<SolarTrainingJobRow[]>`
      INSERT INTO solar_training_job (
        id,
        plant_id,
        status,
        params_json,
        requested_by,
        updated_at
      )
      VALUES (
        ${jobId},
        ${payload.plantId},
        'PENDING',
        ${JSON.stringify(params)}::jsonb,
        ${payload.requestedBy ?? 'manual'},
        NOW()
      )
      RETURNING
        id,
        plant_id AS "plantId",
        status,
        params_json AS "paramsJson",
        metrics_json AS "metricsJson",
        model_version_id AS "modelVersionId",
        requested_by AS "requestedBy",
        error_message AS "errorMessage",
        started_at AS "startedAt",
        finished_at AS "finishedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;
    const job = inserted[0];

    return {
      jobId: job.id,
      status: job.status,
      plantId: job.plantId,
      createdAt: job.createdAt
    };
  }

  async getTrainingJob(jobId: string) {
    const rows = await this.prisma.$queryRaw<SolarTrainingJobRow[]>`
      SELECT
        id,
        plant_id AS "plantId",
        status,
        params_json AS "paramsJson",
        metrics_json AS "metricsJson",
        model_version_id AS "modelVersionId",
        requested_by AS "requestedBy",
        error_message AS "errorMessage",
        started_at AS "startedAt",
        finished_at AS "finishedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM solar_training_job
      WHERE id = ${jobId}
      LIMIT 1
    `;
    const job = rows[0];
    if (!job) {
      throw new NotFoundException(`jobId not found: ${jobId}`);
    }

    return {
      jobId: job.id,
      plantId: job.plantId,
      status: job.status,
      params: this.parseJsonField<Record<string, unknown>>(job.paramsJson, {}),
      metrics: this.parseJsonField<Record<string, unknown> | null>(job.metricsJson, null),
      modelVersionId: job.modelVersionId,
      requestedBy: job.requestedBy,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      createdAt: job.createdAt
    };
  }

  async listModels(query: ListSolarModelsDto) {
    const rows = await this.prisma.$queryRaw<SolarModelVersionRow[]>`
      SELECT
        id,
        plant_id AS "plantId",
        version,
        algorithm,
        features_json AS "featuresJson",
        hyperparams_json AS "hyperparamsJson",
        metrics_json AS "metricsJson",
        train_window_start AS "trainWindowStart",
        train_window_end AS "trainWindowEnd",
        is_active AS "isActive",
        artifact_json AS "artifactJson",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM solar_model_version
      WHERE plant_id = ${query.plantId}
      ORDER BY created_at DESC
    `;

    return {
      plantId: query.plantId,
      count: rows.length,
      items: rows.map((row) => ({
        id: row.id,
        version: row.version,
        algorithm: row.algorithm,
        isActive: row.isActive,
        metrics: this.parseJsonField<Record<string, number>>(row.metricsJson, {}),
        trainWindowStart: row.trainWindowStart,
        trainWindowEnd: row.trainWindowEnd,
        createdAt: row.createdAt
      }))
    };
  }

  async runForecast(payload: RunSolarForecastDto) {
    const plant = await this.getPlantOrFail(payload.plantId);
    const model = await this.getActiveModelOrFail(payload.plantId);

    const horizons = [...new Set((payload.horizons ?? [24]).map((item) => Number(item)))].sort(
      (a, b) => a - b
    );
    const maxHorizon = Math.max(...horizons);

    const artifact = this.parseJsonField<{
      hourMeans?: Record<string, number>;
      weatherHourMeans?: Record<string, { ghi: number; temp: number; wind: number }>;
      coefficients?: number[];
      mode?: string;
    }>(model.artifactJson, {});
    const hourMeans = artifact.hourMeans ?? {};
    const weatherHourMeans = artifact.weatherHourMeans ?? {};
    const coefficients = artifact.coefficients ?? null;
    const mode = artifact.mode ?? 'V1_FALLBACK';
    const metrics = this.parseJsonField<{ rmse?: number }>(model.metricsJson, {});
    const baseSigma = Math.max(0.05, metrics.rmse ?? 0.2);

    const now = this.normalizeHourUtc(new Date());
    const runAt = new Date();

    const latestGen = await this.prisma.$queryRaw<{ generationMw: number }[]>`
      SELECT generation_mw AS "generationMw"
      FROM solar_generation_hourly
      WHERE plant_id = ${payload.plantId}
      ORDER BY timestamp_utc DESC
      LIMIT 1
    `;
    let prevGenerationMw = latestGen[0]?.generationMw ?? 0;

    await this.prisma.$executeRaw`
      DELETE FROM solar_forecast
      WHERE plant_id = ${payload.plantId}
        AND forecast_run_at < NOW() - INTERVAL '7 days'
    `;

    const insertedPoints: number[] = [];
    let generatedPoints = 0;
    for (let h = 1; h <= maxHorizon; h += 1) {
      const target = new Date(now);
      target.setUTCHours(target.getUTCHours() + h);
      const hour = target.getUTCHours();
      const hourProfile = (hourMeans[String(hour)] ?? 0) / Math.max(plant.installedCapacityMw, 0.001);
      const weatherMean = weatherHourMeans[String(hour)] ?? { ghi: 0, temp: 25, wind: 2 };
      const features = [
        1,
        hourProfile,
        weatherMean.ghi / 1000,
        weatherMean.temp / 40,
        weatherMean.wind / 15,
        prevGenerationMw / Math.max(plant.installedCapacityMw, 0.001)
      ];
      const yNorm =
        mode === 'V2_CLIMATE' && coefficients && coefficients.length === features.length
          ? this.dot(coefficients, features)
          : hourProfile;
      const yHat = Math.max(
        0,
        Math.min(plant.installedCapacityMw * 1.1, Number((yNorm * plant.installedCapacityMw).toFixed(4)))
      );
      prevGenerationMw = yHat;
      const cf = Number((yHat / plant.installedCapacityMw).toFixed(4));
      const sigmaH = baseSigma * (1 + h * 0.01);
      const p10 = Math.max(0, Number((yHat - 1.28 * sigmaH).toFixed(4)));
      const p50 = Number(yHat.toFixed(4));
      const p90 = Number((yHat + 1.28 * sigmaH).toFixed(4));

      await this.prisma.$executeRaw`
        INSERT INTO solar_forecast (
          id,
          plant_id,
          model_version_id,
          forecast_run_at,
          target_timestamp_utc,
          horizon_hours,
          pred_generation_mw,
          pred_capacity_factor,
          p10_generation_mw,
          p50_generation_mw,
          p90_generation_mw
        )
        VALUES (
          ${this.buildId('sfc')},
          ${payload.plantId},
          ${model.id},
          ${runAt},
          ${target},
          ${h},
          ${yHat},
          ${cf},
          ${p10},
          ${p50},
          ${p90}
        )
      `;
      generatedPoints += 1;
      if (horizons.includes(h)) insertedPoints.push(h);
    }

    return {
      forecastRunAt: runAt,
      plantId: payload.plantId,
      modelVersionId: model.id,
      generatedPoints,
      requestedHorizons: horizons,
      checkpointHours: insertedPoints
    };
  }

  async getForecast(query: GetSolarForecastDto) {
    const plant = await this.getPlantOrFail(query.plantId);
    const horizon = query.horizon ?? 24;

    const latest = await this.prisma.$queryRaw<{ forecastRunAt: Date }[]>`
      SELECT forecast_run_at AS "forecastRunAt"
      FROM solar_forecast
      WHERE plant_id = ${query.plantId}
      ORDER BY forecast_run_at DESC
      LIMIT 1
    `;
    if (!latest[0]) {
      throw new NotFoundException(`no forecast run found for plantId: ${query.plantId}`);
    }

    const rows = await this.prisma.$queryRaw<SolarForecastRow[]>`
      SELECT
        id,
        plant_id AS "plantId",
        model_version_id AS "modelVersionId",
        forecast_run_at AS "forecastRunAt",
        target_timestamp_utc AS "targetTimestampUtc",
        horizon_hours AS "horizonHours",
        pred_generation_mw AS "predGenerationMw",
        pred_capacity_factor AS "predCapacityFactor",
        p10_generation_mw AS "p10GenerationMw",
        p50_generation_mw AS "p50GenerationMw",
        p90_generation_mw AS "p90GenerationMw"
      FROM solar_forecast
      WHERE plant_id = ${query.plantId}
        AND forecast_run_at = ${latest[0].forecastRunAt}
        AND horizon_hours <= ${horizon}
      ORDER BY target_timestamp_utc ASC
    `;

    return {
      plantId: query.plantId,
      plantName: plant.name,
      horizonHours: horizon,
      forecastRunAt: latest[0].forecastRunAt,
      count: rows.length,
      items: rows.map((row) => ({
        timestamp: row.targetTimestampUtc,
        horizonHours: row.horizonHours,
        predGenerationMw: row.predGenerationMw,
        predCapacityFactor: row.predCapacityFactor,
        p10GenerationMw: row.p10GenerationMw,
        p50GenerationMw: row.p50GenerationMw,
        p90GenerationMw: row.p90GenerationMw
      }))
    };
  }

  async syncAlerts(payload: SyncSolarAlertsDto) {
    await this.getPlantOrFail(payload.plantId);

    const equipment = await this.prisma.equipment.findUnique({
      where: { id: payload.equipmentId }
    });
    if (!equipment) {
      throw new NotFoundException(`equipmentId not found: ${payload.equipmentId}`);
    }

    const summary = await this.dashboardSummary({
      plantId: payload.plantId,
      equipmentId: payload.equipmentId
    });
    const amplifiedRisk = summary.riskBridge.amplifiedRisk;
    const delta = summary.riskBridge.delta;

    if (delta < 2) {
      return {
        createdAlerts: 0,
        reason: 'Delta de risco solar abaixo do limiar mínimo para alerta contextual.'
      };
    }

    const severity = this.severityFromRisk(amplifiedRisk);
    const title =
      severity === 'CRITICAL'
        ? 'Risco ampliado por baixa disponibilidade solar'
        : 'Atenção: impacto solar no risco operacional';

    const explanation = `Risco base ${summary.riskBridge.baseRisk.toFixed(
      2
    )} -> risco ampliado ${summary.riskBridge.amplifiedRisk.toFixed(
      2
    )} (delta ${summary.riskBridge.delta.toFixed(2)}).`;

    const rootCauseHint = `Previsão média 24h em ${summary.forecast24h.avgGenerationMw.toFixed(
      2
    )} MW com fator de capacidade ${(
      summary.forecast24h.avgCapacityFactor * 100
    ).toFixed(2)}%.`;

    const alert = await this.prisma.alertEvent.create({
      data: {
        equipmentId: payload.equipmentId,
        timestamp: new Date(),
        severity,
        title,
        explanation,
        rootCauseHint,
        source: 'SOLAR_FORECAST' as EventSource,
        payloadJson: {
          plantId: payload.plantId,
          plantName: summary.plant.name,
          forecast24h: summary.forecast24h,
          riskBridge: summary.riskBridge,
          mode: payload.mode ?? 'RISK_BRIDGE'
        }
      }
    });

    return {
      createdAlerts: 1,
      items: [
        {
          id: alert.id,
          severity: alert.severity,
          title: alert.title,
          explanation: alert.explanation,
          riskAmplificationPoints: delta
        }
      ]
    };
  }

  private async processPendingTrainingJob() {
    if (this.workerBusy) return;
    this.workerBusy = true;

    try {
      const rows = await this.prisma.$queryRaw<SolarTrainingJobRow[]>`
        UPDATE solar_training_job
        SET status = 'RUNNING',
            started_at = NOW(),
            updated_at = NOW()
        WHERE id = (
          SELECT id
          FROM solar_training_job
          WHERE status = 'PENDING'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING
          id,
          plant_id AS "plantId",
          status,
          params_json AS "paramsJson",
          metrics_json AS "metricsJson",
          model_version_id AS "modelVersionId",
          requested_by AS "requestedBy",
          error_message AS "errorMessage",
          started_at AS "startedAt",
          finished_at AS "finishedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `;
      const job = rows[0];
      if (!job) return;

      await this.executeTrainingJob(job);
    } catch (error) {
      this.logger.error(`training worker failure: ${(error as Error).message}`);
    } finally {
      this.workerBusy = false;
    }
  }

  private async executeTrainingJob(job: SolarTrainingJobRow) {
    const params = this.parseJsonField<{
      trainWindowDays?: number;
      algorithm?: string;
      activateModel?: boolean;
    }>(job.paramsJson, {});
    const trainWindowDays = params.trainWindowDays ?? 365;
    const algorithm = params.algorithm ?? 'RIDGE_LAGS_CLIMATE_V2';
    const activateModel = params.activateModel ?? true;

    try {
      const windowEnd = new Date();
      const windowStart = new Date(windowEnd);
      windowStart.setUTCDate(windowStart.getUTCDate() - trainWindowDays);

      const rows = await this.prisma.$queryRaw<SolarTrainRow[]>`
        SELECT
          g.timestamp_utc AS "timestampUtc",
          g.generation_mw AS "generationMw",
          w.ghi_wm2 AS "ghiWm2",
          w.temp_c AS "tempC",
          w.wind_speed_ms AS "windSpeedMs"
        FROM solar_generation_hourly g
        LEFT JOIN solar_weather_hourly w
          ON w.plant_id = g.plant_id
         AND w.timestamp_utc = g.timestamp_utc
        WHERE g.plant_id = ${job.plantId}
          AND g.timestamp_utc >= ${windowStart}
          AND g.timestamp_utc <= ${windowEnd}
        ORDER BY g.timestamp_utc ASC
      `;

      if (rows.length < 72) {
        throw new BadRequestException('at least 72 hourly points are required for training');
      }

      const plant = await this.getPlantOrFail(job.plantId);
      const capacity = Math.max(plant.installedCapacityMw, 0.001);

      const split = Math.max(48, Math.floor(rows.length * 0.8));
      const trainRows = rows.slice(0, split);
      const testRows = rows.slice(split);
      if (testRows.length === 0) {
        throw new BadRequestException('insufficient test window for metrics');
      }

      const hourBuckets = new Map<number, { sum: number; count: number }>();
      for (const row of trainRows) {
        const hour = new Date(row.timestampUtc).getUTCHours();
        const bucket = hourBuckets.get(hour) ?? { sum: 0, count: 0 };
        bucket.sum += row.generationMw;
        bucket.count += 1;
        hourBuckets.set(hour, bucket);
      }

      const hourMeans: Record<string, number> = {};
      for (let hour = 0; hour < 24; hour += 1) {
        const bucket = hourBuckets.get(hour);
        hourMeans[String(hour)] = bucket && bucket.count > 0 ? Number((bucket.sum / bucket.count).toFixed(4)) : 0;
      }

      const weatherHourBuckets = new Map<number, { ghiSum: number; ghiN: number; tempSum: number; tempN: number; windSum: number; windN: number }>();
      for (const row of trainRows) {
        const hour = new Date(row.timestampUtc).getUTCHours();
        const acc = weatherHourBuckets.get(hour) ?? {
          ghiSum: 0,
          ghiN: 0,
          tempSum: 0,
          tempN: 0,
          windSum: 0,
          windN: 0
        };
        if (row.ghiWm2 != null) {
          acc.ghiSum += row.ghiWm2;
          acc.ghiN += 1;
        }
        if (row.tempC != null) {
          acc.tempSum += row.tempC;
          acc.tempN += 1;
        }
        if (row.windSpeedMs != null) {
          acc.windSum += row.windSpeedMs;
          acc.windN += 1;
        }
        weatherHourBuckets.set(hour, acc);
      }

      const weatherHourMeans: Record<string, { ghi: number; temp: number; wind: number }> = {};
      for (let hour = 0; hour < 24; hour += 1) {
        const b = weatherHourBuckets.get(hour);
        weatherHourMeans[String(hour)] = {
          ghi: b && b.ghiN > 0 ? b.ghiSum / b.ghiN : 0,
          temp: b && b.tempN > 0 ? b.tempSum / b.tempN : 25,
          wind: b && b.windN > 0 ? b.windSum / b.windN : 2
        };
      }

      const buildFeatures = (current: SolarTrainRow, prevGenerationMw: number) => {
        const hour = new Date(current.timestampUtc).getUTCHours();
        const hourProfile = (hourMeans[String(hour)] ?? 0) / capacity;
        const weatherMean = weatherHourMeans[String(hour)] ?? { ghi: 0, temp: 25, wind: 2 };
        const ghi = (current.ghiWm2 ?? weatherMean.ghi) / 1000;
        const temp = (current.tempC ?? weatherMean.temp) / 40;
        const wind = (current.windSpeedMs ?? weatherMean.wind) / 15;
        const lag1 = prevGenerationMw / capacity;
        return [1, hourProfile, ghi, temp, wind, lag1];
      };

      const X: number[][] = [];
      const y: number[] = [];
      for (let i = 1; i < trainRows.length; i += 1) {
        X.push(buildFeatures(trainRows[i], trainRows[i - 1].generationMw));
        y.push(trainRows[i].generationMw / capacity);
      }

      const weatherCoverageTrain =
        trainRows.length > 0
          ? trainRows.filter((r) => r.ghiWm2 != null || r.tempC != null || r.windSpeedMs != null).length /
            trainRows.length
          : 0;
      const useV2 = algorithm === 'RIDGE_LAGS_CLIMATE_V2' && weatherCoverageTrain >= 0.1 && X.length >= 30;
      const weights = useV2 ? this.trainRidgeGradientDescent(X, y) : null;

      const predict = (row: SolarTrainRow, prevGenerationMw: number): number => {
        const hour = new Date(row.timestampUtc).getUTCHours();
        if (!useV2 || !weights) return hourMeans[String(hour)] ?? 0;
        const features = buildFeatures(row, prevGenerationMw);
        const yNorm = this.dot(weights, features);
        return Math.max(0, Math.min(capacity * 1.1, yNorm * capacity));
      };

      let absErrorSum = 0;
      let absPercentErrorSum = 0;
      let squaredErrorSum = 0;
      let mapeCount = 0;

      let prev = trainRows[trainRows.length - 1].generationMw;
      for (const row of testRows) {
        const y = row.generationMw;
        const yHat = predict(row, prev);
        const absError = Math.abs(y - yHat);
        absErrorSum += absError;
        squaredErrorSum += (y - yHat) ** 2;
        if (y !== 0) {
          absPercentErrorSum += Math.abs((y - yHat) / y);
          mapeCount += 1;
        }
        prev = y;
      }

      const mae = Number((absErrorSum / testRows.length).toFixed(4));
      const rmse = Number(Math.sqrt(squaredErrorSum / testRows.length).toFixed(4));
      const mape = Number(((mapeCount > 0 ? absPercentErrorSum / mapeCount : 0) * 100).toFixed(4));

      const metrics = {
        mae,
        rmse,
        mape,
        testPoints: testRows.length,
        trainPoints: trainRows.length,
        weatherCoverageTrain: Number((weatherCoverageTrain * 100).toFixed(2)),
        modelMode: useV2 ? 'V2_CLIMATE' : 'V1_FALLBACK'
      };
      const version = `v${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12)}`;
      const modelId = this.buildId('smv');

      if (activateModel) {
        await this.prisma.$executeRaw`
          UPDATE solar_model_version
          SET is_active = false, updated_at = NOW()
          WHERE plant_id = ${job.plantId}
            AND is_active = true
        `;
      }

      await this.prisma.$executeRaw`
        INSERT INTO solar_model_version (
          id,
          plant_id,
          version,
          algorithm,
          features_json,
          hyperparams_json,
          metrics_json,
          train_window_start,
          train_window_end,
          is_active,
          artifact_json,
          updated_at
        )
        VALUES (
          ${modelId},
          ${job.plantId},
          ${version},
          ${algorithm},
          ${
            JSON.stringify(
              useV2
                ? ['bias', 'hour_profile', 'ghi_norm', 'temp_norm', 'wind_norm', 'lag1_norm']
                : ['hour_profile']
            )
          }::jsonb,
          ${JSON.stringify({ method: useV2 ? 'ridge_gd' : 'hourly_mean_fallback' })}::jsonb,
          ${JSON.stringify(metrics)}::jsonb,
          ${rows[0].timestampUtc},
          ${rows[rows.length - 1].timestampUtc},
          ${activateModel},
          ${
            JSON.stringify({
              hourMeans,
              weatherHourMeans,
              coefficients: weights,
              capacityMw: capacity,
              mode: useV2 ? 'V2_CLIMATE' : 'V1_FALLBACK'
            })
          }::jsonb,
          NOW()
        )
      `;

      await this.prisma.$executeRaw`
        UPDATE solar_training_job
        SET
          status = 'DONE',
          metrics_json = ${JSON.stringify(metrics)}::jsonb,
          model_version_id = ${modelId},
          finished_at = NOW(),
          updated_at = NOW()
        WHERE id = ${job.id}
      `;

      this.logger.log(`solar training done: job=${job.id} model=${modelId} plant=${job.plantId}`);
    } catch (error) {
      const message = (error as Error).message.slice(0, 500);
      await this.prisma.$executeRaw`
        UPDATE solar_training_job
        SET
          status = 'FAILED',
          error_message = ${message},
          finished_at = NOW(),
          updated_at = NOW()
        WHERE id = ${job.id}
      `;
      this.logger.error(`solar training failed: job=${job.id} reason=${message}`);
    }
  }

  async dashboardSummary(query: SolarDashboardSummaryDto) {
    const plantRows = await this.prisma.$queryRaw<SolarPlantRow[]>`
      SELECT
        id,
        name,
        ons_plant_code AS "onsPlantCode",
        latitude,
        longitude,
        installed_capacity_mw AS "installedCapacityMw",
        timezone,
        is_active AS "isActive",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM solar_plant
      WHERE id = ${query.plantId}
      LIMIT 1
    `;
    const plant = plantRows[0];

    if (!plant) {
      throw new NotFoundException(`plantId not found: ${query.plantId}`);
    }

    let baseRisk = 0;
    if (query.equipmentId) {
      const latestRun = await this.prisma.analysisRun.findFirst({
        where: { equipmentId: query.equipmentId },
        orderBy: { executedAt: 'desc' }
      });

      if (latestRun?.summaryJson) {
        const summary = latestRun.summaryJson as {
          risk?: { current?: number };
        };
        baseRisk = summary.risk?.current ?? 0;
      }
    }

    const latestForecastRun = await this.prisma.$queryRaw<{ forecastRunAt: Date }[]>`
      SELECT forecast_run_at AS "forecastRunAt"
      FROM solar_forecast
      WHERE plant_id = ${query.plantId}
      ORDER BY forecast_run_at DESC
      LIMIT 1
    `;
    const forecastRows = latestForecastRun[0]
      ? await this.prisma.$queryRaw<SolarForecastRow[]>`
          SELECT
            id,
            plant_id AS "plantId",
            model_version_id AS "modelVersionId",
            forecast_run_at AS "forecastRunAt",
            target_timestamp_utc AS "targetTimestampUtc",
            horizon_hours AS "horizonHours",
            pred_generation_mw AS "predGenerationMw",
            pred_capacity_factor AS "predCapacityFactor",
            p10_generation_mw AS "p10GenerationMw",
            p50_generation_mw AS "p50GenerationMw",
            p90_generation_mw AS "p90GenerationMw"
          FROM solar_forecast
          WHERE plant_id = ${query.plantId}
            AND forecast_run_at = ${latestForecastRun[0].forecastRunAt}
            AND horizon_hours <= 24
          ORDER BY target_timestamp_utc ASC
        `
      : [];

    const historyRows = await this.prisma.$queryRaw<SolarGenerationPointRow[]>`
      SELECT
        timestamp_utc AS "timestampUtc",
        generation_mw AS "generationMw",
        capacity_factor AS "capacityFactor"
      FROM solar_generation_hourly
      WHERE plant_id = ${query.plantId}
      ORDER BY timestamp_utc ASC
    `;

    const hourlyBaseline = new Map<number, number>();
    if (historyRows.length > 0) {
      const buckets = new Map<number, { sum: number; count: number }>();
      for (const row of historyRows) {
        const hour = new Date(row.timestampUtc).getUTCHours();
        const bucket = buckets.get(hour) ?? { sum: 0, count: 0 };
        bucket.sum += row.generationMw;
        bucket.count += 1;
        buckets.set(hour, bucket);
      }

      for (let hour = 0; hour < 24; hour += 1) {
        const bucket = buckets.get(hour);
        hourlyBaseline.set(hour, bucket && bucket.count > 0 ? bucket.sum / bucket.count : 0);
      }
    }

    const avgGenerationMw =
      forecastRows.length > 0
        ? Number(
            (
              forecastRows.reduce((acc, item) => acc + item.predGenerationMw, 0) / forecastRows.length
            ).toFixed(2)
          )
        : Number((plant.installedCapacityMw * 0.38).toFixed(2));

    const avgCapacityFactor = Number((avgGenerationMw / plant.installedCapacityMw).toFixed(4));
    const trendPercent =
      forecastRows.length > 1
        ? Number(
            (
              ((forecastRows[forecastRows.length - 1].predGenerationMw - forecastRows[0].predGenerationMw) /
                Math.max(forecastRows[0].predGenerationMw, 0.001)) *
              100
            ).toFixed(2)
          )
        : -6.5;

    const activeModelRows = await this.prisma.$queryRaw<SolarModelVersionRow[]>`
      SELECT
        id,
        plant_id AS "plantId",
        version,
        algorithm,
        features_json AS "featuresJson",
        hyperparams_json AS "hyperparamsJson",
        metrics_json AS "metricsJson",
        train_window_start AS "trainWindowStart",
        train_window_end AS "trainWindowEnd",
        is_active AS "isActive",
        artifact_json AS "artifactJson",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM solar_model_version
      WHERE plant_id = ${query.plantId}
        AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const activeModel = activeModelRows[0];
    const activeMetrics = activeModel
      ? this.parseJsonField<{ mape?: number }>(activeModel.metricsJson, {})
      : {};
    const mape = activeMetrics.mape ?? null;
    const confidenceLabel =
      mape == null ? 'PENDENTE_TREINO' : mape <= 8 ? 'ALTA' : mape <= 15 ? 'MEDIA' : 'BAIXA';

    const expectedEnergyMwh24h =
      forecastRows.length > 0
        ? Number(
            forecastRows
              .reduce((acc, row) => {
                const hour = new Date(row.targetTimestampUtc).getUTCHours();
                return acc + (hourlyBaseline.get(hour) ?? row.predGenerationMw);
              }, 0)
              .toFixed(2)
          )
        : Number((plant.installedCapacityMw * 24 * 0.42).toFixed(2));

    const forecastEnergyMwh24h =
      forecastRows.length > 0
        ? Number(forecastRows.reduce((acc, row) => acc + row.predGenerationMw, 0).toFixed(2))
        : Number((avgGenerationMw * 24).toFixed(2));

    const energyGapMwh24h = Number((forecastEnergyMwh24h - expectedEnergyMwh24h).toFixed(2));
    const absoluteLossMwh24h = Number(Math.max(0, -energyGapMwh24h).toFixed(2));
    const pricePerMwhBrl = Number((query.pricePerMwhBrl ?? 650).toFixed(2));
    const revenueExpectedBrl24h = Number((expectedEnergyMwh24h * pricePerMwhBrl).toFixed(2));
    const revenueForecastBrl24h = Number((forecastEnergyMwh24h * pricePerMwhBrl).toFixed(2));
    const revenueGapBrl24h = Number((revenueForecastBrl24h - revenueExpectedBrl24h).toFixed(2));
    const estimatedLossBrl24h = Number(Math.max(0, -revenueGapBrl24h).toFixed(2));
    const potentialAvoidedLossBrl = Number((estimatedLossBrl24h * 0.35).toFixed(2));
    const expectedCapacityFactor24h = Number(
      (expectedEnergyMwh24h / Math.max(plant.installedCapacityMw * 24, 0.001)).toFixed(4)
    );

    const solarAvailabilityFactor = 1 - avgCapacityFactor;
    const riskDelta = Number((solarAvailabilityFactor * 15).toFixed(2));
    const amplifiedRisk = Number(Math.min(100, baseRisk + riskDelta).toFixed(2));

    const coverageRows = await this.prisma.$queryRaw<{ total: bigint; matched: bigint }[]>`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(w.timestamp_utc)::bigint AS matched
      FROM solar_generation_hourly g
      LEFT JOIN solar_weather_hourly w
        ON w.plant_id = g.plant_id
       AND w.timestamp_utc = g.timestamp_utc
      WHERE g.plant_id = ${query.plantId}
    `;
    const total = Number(coverageRows[0]?.total ?? 0);
    const matched = Number(coverageRows[0]?.matched ?? 0);
    const weatherCoveragePercent = total > 0 ? Number(((matched / total) * 100).toFixed(2)) : 0;

    return {
      plant: {
        id: plant.id,
        name: plant.name,
        installedCapacityMw: plant.installedCapacityMw
      },
      forecast24h: {
        avgGenerationMw,
        avgCapacityFactor,
        trendPercent
      },
      quality: {
        mape,
        confidenceLabel,
        weatherCoveragePercent
      },
      insights: [
        {
          severity: avgCapacityFactor < 0.35 ? 'HIGH' : 'MEDIUM',
          title:
            forecastRows.length > 0
              ? 'Previsão solar calculada com modelo ativo'
              : 'Resumo estrutural de previsão solar',
          explanation:
            forecastRows.length > 0
              ? 'Resumo com base no último forecast de 24h. Use o endpoint de forecast para detalhamento por hora.'
              : 'Resumo inicial sem modelo treinado. A próxima etapa habilita ingestão e treinamento com dados reais.'
        },
        {
          severity: estimatedLossBrl24h > 20000 ? 'CRITICAL' : estimatedLossBrl24h > 5000 ? 'HIGH' : 'MEDIUM',
          title: 'Impacto financeiro projetado (24h)',
          explanation:
            estimatedLossBrl24h > 0
              ? `Gap estimado de receita em R$ ${estimatedLossBrl24h.toFixed(
                  2
                )} considerando tarifa de R$ ${pricePerMwhBrl.toFixed(2)}/MWh.`
              : 'Sem perda financeira prevista no horizonte de 24h para a tarifa selecionada.'
        }
      ],
      financial: {
        pricePerMwhBrl,
        expectedEnergyMwh24h,
        forecastEnergyMwh24h,
        energyGapMwh24h,
        absoluteLossMwh24h,
        expectedCapacityFactor24h,
        revenueExpectedBrl24h,
        revenueForecastBrl24h,
        revenueGapBrl24h,
        estimatedLossBrl24h,
        potentialAvoidedLossBrl
      },
      riskBridge: {
        baseRisk,
        amplifiedRisk,
        delta: riskDelta,
        reason: 'Risco ampliado por disponibilidade solar estimada (placeholder da etapa estrutural).'
      }
    };
  }
}
