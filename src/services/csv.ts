/**
 * Minimal CSV parsing + body-composition normalization.
 *
 * Supports generic exports (atFlee app, Excel-saved CSV) and Samsung Health
 * "personal data download" weight CSVs (which prepend a metadata line).
 * Column names are matched loosely against Korean/English aliases.
 */

/** RFC-4180-ish CSV parser handling quoted fields and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export interface BodyMeasurement {
  date: string; // YYYY-MM-DD
  time?: string;
  weight_kg?: number;
  body_fat_pct?: number;
  skeletal_muscle_kg?: number;
  muscle_mass_kg?: number;
  bmi?: number;
  body_water_pct?: number;
  visceral_fat?: number;
  bmr_kcal?: number;
}

type FieldKey = Exclude<keyof BodyMeasurement, "date" | "time">;

/** Loose header aliases, lowercase with spaces/units/punctuation stripped. */
const HEADER_ALIASES: Record<FieldKey, string[]> = {
  weight_kg: ["weight", "체중", "몸무게", "weightkg"],
  body_fat_pct: ["bodyfat", "체지방률", "체지방율", "체지방", "fatrate", "bodyfatpercentage", "fat"],
  skeletal_muscle_kg: ["skeletalmuscle", "골격근량", "골격근", "skeletalmusclemass"],
  muscle_mass_kg: ["musclemass", "근육량", "muscle"],
  bmi: ["bmi", "체질량지수"],
  body_water_pct: ["bodywater", "체수분", "수분", "totalbodywater", "water"],
  visceral_fat: ["visceralfat", "내장지방", "내장지방레벨", "visceralfatlevel"],
  bmr_kcal: ["basalmetabolicrate", "기초대사량", "bmr"],
};

const DATE_ALIASES = [
  "date", "starttime", "측정일", "측정일시", "측정시간", "날짜", "일자",
  "time", "datetime", "measuretime", "createtime", "recorddate",
];

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/\(.*?\)/g, "") // strip units like (kg), (%)
    .replace(/^com\.samsung\.(s?health|shealth)\.(weight\.)?/, "") // Samsung Health prefixes
    .replace(/[^a-z0-9가-힣]/g, "");
}

/** Parse many date shapes into YYYY-MM-DD (+ optional HH:MM time). */
function parseDate(value: string): { date: string; time?: string } | undefined {
  const v = value.trim();
  if (!v) return undefined;

  // Epoch millis or seconds
  if (/^\d{10}(\d{3})?$/.test(v)) {
    const ms = v.length === 13 ? Number(v) : Number(v) * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
    }
  }

  // 2025-08-01, 2025.08.01, 2025/08/01, 20250801 — optionally followed by time
  const m = v.match(/^(\d{4})[-./년\s]?(\d{1,2})[-./월\s]?(\d{1,2})[일]?[T\s]*(\d{1,2}:\d{2})?/);
  if (m) {
    const date = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    return { date, time: m[4] };
  }
  return undefined;
}

function parseNumber(value: string): number | undefined {
  const n = parseFloat(value.replace(/[^\d.\-]/g, ""));
  return isFinite(n) ? n : undefined;
}

export interface ParsedBodyData {
  measurements: BodyMeasurement[];
  detectedColumns: Record<string, string>;
  skippedRows: number;
}

/**
 * Convert raw CSV text into normalized body measurements.
 * Scans the first few rows for the real header line (Samsung Health exports
 * put a metadata line above it), maps columns by alias, then parses rows.
 */
export function parseBodyCompositionCsv(text: string): ParsedBodyData {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { measurements: [], detectedColumns: {}, skippedRows: 0 };
  }

  // Find the header row: the first row within the top 5 that contains a
  // recognizable date column AND at least one known metric column.
  let headerIndex = -1;
  let dateCol = -1;
  let fieldCols: Partial<Record<FieldKey, number>> = {};

  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const normalized = rows[r].map(normalizeHeader);
    const dIdx = normalized.findIndex((h) => DATE_ALIASES.includes(h));
    const cols: Partial<Record<FieldKey, number>> = {};
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [FieldKey, string[]][]) {
      const idx = normalized.findIndex((h) => aliases.includes(h));
      if (idx >= 0) cols[field] = idx;
    }
    if (dIdx >= 0 && Object.keys(cols).length > 0) {
      headerIndex = r;
      dateCol = dIdx;
      fieldCols = cols;
      break;
    }
  }

  if (headerIndex < 0) {
    return { measurements: [], detectedColumns: {}, skippedRows: rows.length };
  }

  const detectedColumns: Record<string, string> = {
    date: rows[headerIndex][dateCol],
  };
  for (const [field, idx] of Object.entries(fieldCols)) {
    detectedColumns[field] = rows[headerIndex][idx as number];
  }

  const measurements: BodyMeasurement[] = [];
  let skippedRows = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const parsed = parseDate(row[dateCol] ?? "");
    if (!parsed) {
      skippedRows++;
      continue;
    }
    const m: BodyMeasurement = { date: parsed.date, time: parsed.time };
    for (const [field, idx] of Object.entries(fieldCols) as [FieldKey, number][]) {
      const n = parseNumber(row[idx] ?? "");
      if (n !== undefined) m[field] = n;
    }
    if (m.weight_kg === undefined && m.body_fat_pct === undefined && m.bmi === undefined) {
      skippedRows++;
      continue;
    }
    measurements.push(m);
  }

  measurements.sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  return { measurements, detectedColumns, skippedRows };
}
