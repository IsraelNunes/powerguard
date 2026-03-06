export interface ParsedGenerationCsvRow {
  line: number;
  timestamp: Date;
  generationMw: number;
  capacityFactor: number | null;
}

export interface ParsedGenerationCsvResult {
  rows: ParsedGenerationCsvRow[];
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

export function parseGenerationCsv(content: string): ParsedGenerationCsvResult {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      errors: ['CSV vazio ou sem linhas de dados.']
    };
  }

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = splitCsvLine(lines[0], delimiter).map(normalizeHeader);

  const timestampCandidates = ['timestamp', 'timestamp_utc', 'datetime', 'data_hora', 'datahora'];
  const generationCandidates = ['generation_mw', 'generation', 'geracao_mw', 'geracao'];
  const capacityCandidates = ['capacity_factor', 'fator_capacidade', 'factor_capacity', 'cf'];

  const findColumnIndex = (candidates: string[]) =>
    headers.findIndex((header) => candidates.includes(header));

  const tsIdx = findColumnIndex(timestampCandidates);
  const generationIdx = findColumnIndex(generationCandidates);
  const capacityIdx = findColumnIndex(capacityCandidates);

  const errors: string[] = [];
  if (tsIdx < 0) errors.push('Coluna de timestamp não encontrada.');
  if (generationIdx < 0) errors.push('Coluna de geração (MW) não encontrada.');
  if (errors.length > 0) return { rows: [], errors };

  const rows: ParsedGenerationCsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = i + 1;
    const cols = splitCsvLine(lines[i], delimiter);

    const tsRaw = cols[tsIdx] ?? '';
    const generationRaw = cols[generationIdx] ?? '';
    const capacityRaw = capacityIdx >= 0 ? cols[capacityIdx] ?? '' : '';

    const timestamp = new Date(tsRaw);
    if (Number.isNaN(timestamp.getTime())) {
      errors.push(`Linha ${line}: timestamp inválido (${tsRaw}).`);
      continue;
    }

    const generationMw = parseNumber(generationRaw);
    if (generationMw == null) {
      errors.push(`Linha ${line}: geração inválida (${generationRaw}).`);
      continue;
    }

    const capacityFactor = capacityIdx >= 0 ? parseNumber(capacityRaw) : null;

    rows.push({
      line,
      timestamp,
      generationMw,
      capacityFactor
    });
  }

  return {
    rows,
    errors
  };
}
