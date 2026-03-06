const REQUIRED_COLUMNS = [
  'timestamp',
  'voltage',
  'current',
  'power',
  'frequency',
  'temperature'
] as const;

type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];

export interface ParsedMeasurementRow {
  timestamp: Date;
  voltage: number;
  current: number;
  power: number;
  frequency: number;
  temperature: number;
  phaseA?: number;
  phaseB?: number;
  phaseC?: number;
}

export interface CsvValidationResult {
  rows: ParsedMeasurementRow[];
  errors: string[];
  columns: string[];
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseNumberOrError(value: string, field: string, rowIndex: number, errors: string[]): number {
  if (value === '') {
    errors.push(`row ${rowIndex}: missing ${field}`);
    return Number.NaN;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    errors.push(`row ${rowIndex}: invalid ${field}`);
    return Number.NaN;
  }

  if (parsed < 0) {
    errors.push(`row ${rowIndex}: negative ${field} is not allowed`);
    return Number.NaN;
  }

  return parsed;
}

export function parseAndValidateCsv(content: string): CsvValidationResult {
  const errors: string[] = [];
  const normalized = content.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return { rows: [], errors: ['empty CSV file'], columns: [] };
  }

  const lines = normalized.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    return { rows: [], errors: ['CSV must contain header and at least one data row'], columns: [] };
  }

  const columns = parseCsvLine(lines[0]);
  const columnIndex = new Map<string, number>();
  columns.forEach((column, idx) => columnIndex.set(column, idx));

  REQUIRED_COLUMNS.forEach((required) => {
    if (!columnIndex.has(required)) {
      errors.push(`missing required column: ${required}`);
    }
  });

  if (errors.length > 0) {
    return { rows: [], errors, columns };
  }

  const rows: ParsedMeasurementRow[] = [];
  let previousTimestampMs = Number.MIN_SAFE_INTEGER;

  for (let i = 1; i < lines.length; i += 1) {
    const csvLine = parseCsvLine(lines[i]);
    const rowIndex = i + 1;

    const get = (column: RequiredColumn | 'phase_a' | 'phase_b' | 'phase_c') => {
      const idx = columnIndex.get(column);
      if (idx === undefined) {
        return '';
      }
      return csvLine[idx] ?? '';
    };

    const timestampRaw = get('timestamp');
    const timestamp = new Date(timestampRaw);
    if (timestampRaw === '' || Number.isNaN(timestamp.getTime())) {
      errors.push(`row ${rowIndex}: invalid timestamp`);
      continue;
    }

    if (timestamp.getTime() <= previousTimestampMs) {
      errors.push(`row ${rowIndex}: timestamp must be strictly increasing`);
      continue;
    }

    previousTimestampMs = timestamp.getTime();

    const voltage = parseNumberOrError(get('voltage'), 'voltage', rowIndex, errors);
    const current = parseNumberOrError(get('current'), 'current', rowIndex, errors);
    const power = parseNumberOrError(get('power'), 'power', rowIndex, errors);
    const frequency = parseNumberOrError(get('frequency'), 'frequency', rowIndex, errors);
    const temperature = parseNumberOrError(get('temperature'), 'temperature', rowIndex, errors);

    const phaseARaw = get('phase_a');
    const phaseBRaw = get('phase_b');
    const phaseCRaw = get('phase_c');

    const phaseA = phaseARaw === '' ? undefined : Number(phaseARaw);
    const phaseB = phaseBRaw === '' ? undefined : Number(phaseBRaw);
    const phaseC = phaseCRaw === '' ? undefined : Number(phaseCRaw);

    if (phaseA !== undefined && !Number.isFinite(phaseA)) {
      errors.push(`row ${rowIndex}: invalid phase_a`);
    }
    if (phaseB !== undefined && !Number.isFinite(phaseB)) {
      errors.push(`row ${rowIndex}: invalid phase_b`);
    }
    if (phaseC !== undefined && !Number.isFinite(phaseC)) {
      errors.push(`row ${rowIndex}: invalid phase_c`);
    }

    if (
      !Number.isFinite(voltage) ||
      !Number.isFinite(current) ||
      !Number.isFinite(power) ||
      !Number.isFinite(frequency) ||
      !Number.isFinite(temperature)
    ) {
      continue;
    }

    rows.push({
      timestamp,
      voltage,
      current,
      power,
      frequency,
      temperature,
      phaseA,
      phaseB,
      phaseC
    });
  }

  return { rows, errors, columns };
}
