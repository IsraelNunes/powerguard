export interface ParsedWeatherCsvRow {
  line: number;
  timestamp: Date;
  ghiWm2: number | null;
  dniWm2: number | null;
  dhiWm2: number | null;
  tempC: number | null;
  cloudCoverPct: number | null;
  windSpeedMs: number | null;
}

export interface ParsedWeatherCsvResult {
  rows: ParsedWeatherCsvRow[];
  errors: string[];
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }
  values.push(current.trim());
  return values;
}

function parseNumber(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  const normalized = value.replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '_');
}

function findColumnIndex(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.includes(header));
}

export function parseWeatherCsv(content: string): ParsedWeatherCsvResult {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return { rows: [], errors: ['CSV vazio ou sem linhas de dados.'] };
  }

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = splitCsvLine(lines[0], delimiter).map(normalizeHeader);

  const tsIdx = findColumnIndex(headers, ['timestamp', 'timestamp_utc', 'datetime', 'data_hora', 'datahora']);
  const ghiIdx = findColumnIndex(headers, ['ghi_wm2', 'ghi', 'irradiancia_global', 'irradiancia']);
  const dniIdx = findColumnIndex(headers, ['dni_wm2', 'dni']);
  const dhiIdx = findColumnIndex(headers, ['dhi_wm2', 'dhi']);
  const tempIdx = findColumnIndex(headers, ['temp_c', 'temperature_c', 'temperatura_c']);
  const cloudIdx = findColumnIndex(headers, ['cloud_cover_pct', 'cloud_cover', 'nebulosidade_pct']);
  const windIdx = findColumnIndex(headers, ['wind_speed_ms', 'wind_speed', 'vento_ms']);

  const errors: string[] = [];
  if (tsIdx < 0) errors.push('Coluna de timestamp não encontrada.');
  if (ghiIdx < 0 && dniIdx < 0 && tempIdx < 0 && cloudIdx < 0 && windIdx < 0) {
    errors.push('Nenhuma coluna meteorológica reconhecida foi encontrada.');
  }
  if (errors.length > 0) return { rows: [], errors };

  const rows: ParsedWeatherCsvRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = i + 1;
    const cols = splitCsvLine(lines[i], delimiter);
    const tsRaw = cols[tsIdx] ?? '';
    const timestamp = new Date(tsRaw);
    if (Number.isNaN(timestamp.getTime())) {
      errors.push(`Linha ${line}: timestamp inválido (${tsRaw}).`);
      continue;
    }

    rows.push({
      line,
      timestamp,
      ghiWm2: ghiIdx >= 0 ? parseNumber(cols[ghiIdx] ?? '') : null,
      dniWm2: dniIdx >= 0 ? parseNumber(cols[dniIdx] ?? '') : null,
      dhiWm2: dhiIdx >= 0 ? parseNumber(cols[dhiIdx] ?? '') : null,
      tempC: tempIdx >= 0 ? parseNumber(cols[tempIdx] ?? '') : null,
      cloudCoverPct: cloudIdx >= 0 ? parseNumber(cols[cloudIdx] ?? '') : null,
      windSpeedMs: windIdx >= 0 ? parseNumber(cols[windIdx] ?? '') : null
    });
  }

  return { rows, errors };
}
