import { emptyStructuredItem, type StructuredItem } from "@/types/item-schema";

export const STRUCTURED_ENVELOPE_KEY = "structured_json";
export const AUXILIARY_ENVELOPE_KEY = "auxiliary_text_optional";

const structuredFieldNames = Object.keys(
  emptyStructuredItem(),
) as (keyof StructuredItem)[];

const numericStructuredFields = new Set<keyof StructuredItem>([
  "quantity",
  "batchSize",
  "priceEur",
  "weightKg",
  "heightMm",
  "widthMm",
  "lengthMm",
]);

const structuredFieldTokens = new Map(
  structuredFieldNames.map((field) => [normalizeToken(field), field]),
);

// These aliases cover frequent provider mistakes without relying on fuzzy
// matching for known bad spellings or common domain synonyms.
const structuredFieldAliases = new Map<string, keyof StructuredItem>([
  ["manufactuer", "manufacturer"],
  ["manufacturername", "manufacturer"],
  ["productno", "productNumber"],
  ["productnr", "productNumber"],
  ["productnum", "productNumber"],
  ["ean", "eanOrUpc"],
  ["upc", "eanOrUpc"],
  ["eanupc", "eanOrUpc"],
  ["barcode", "eanOrUpc"],
  ["qty", "quantity"],
  ["quantitty", "quantity"],
  ["url", "link"],
  ["website", "link"],
  ["price", "priceEur"],
]);

const structuredEnvelopeAliases = new Set([
  normalizeToken(STRUCTURED_ENVELOPE_KEY),
  "structuredjson",
  "structured",
]);

const auxiliaryEnvelopeAliases = new Set([
  normalizeToken(AUXILIARY_ENVELOPE_KEY),
  "auxiliarytextoptional",
  "auxiliarytext",
  "auxiliary",
]);

/**
 * Parses provider JSON with limited tolerance for LLM formatting artifacts.
 *
 * This accepts raw JSON, fenced JSON, balanced JSON embedded in text, and
 * trailing commas. It does not attempt to infer missing structure.
 */
export function parseLooseJson(
  value: string,
): { ok: true; value: unknown } | { ok: false; error: unknown } {
  const candidates = buildJsonCandidates(value);
  let lastError: unknown = undefined;

  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ok: false,
    error: lastError ?? new Error("No JSON candidate could be parsed."),
  };
}

/**
 * Reads an envelope value using the strict key first, then aliases, then a
 * guarded fuzzy match. Ambiguous fuzzy matches are ignored by findBestFuzzyKey.
 */
export function readEnvelopeValue(
  record: Record<string, unknown>,
  key: typeof STRUCTURED_ENVELOPE_KEY | typeof AUXILIARY_ENVELOPE_KEY,
): unknown {
  if (key in record) {
    return record[key];
  }

  const aliases =
    key === STRUCTURED_ENVELOPE_KEY
      ? structuredEnvelopeAliases
      : auxiliaryEnvelopeAliases;

  for (const [candidateKey, candidateValue] of Object.entries(record)) {
    const token = normalizeToken(candidateKey);
    if (aliases.has(token)) {
      return candidateValue;
    }
  }

  const fuzzyKey = findBestFuzzyKey(
    Object.keys(record),
    normalizeToken(key),
    aliases,
  );

  return fuzzyKey ? record[fuzzyKey] : undefined;
}

/**
 * Accepts a structured_json object or a stringified object.
 * Providers sometimes double-encode nested JSON even when the envelope itself
 * is valid JSON.
 */
export function toObjectValue(
  value: unknown,
): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = parseLooseJson(value);
  if (!parsed.ok) {
    return undefined;
  }

  if (
    !parsed.value ||
    typeof parsed.value !== "object" ||
    Array.isArray(parsed.value)
  ) {
    return undefined;
  }

  return parsed.value as Record<string, unknown>;
}

/**
 * Maps provider field names onto the internal schema field names.
 *
 * The rank system prefers exact keys over normalized, alias, and fuzzy matches
 * so a weaker repair cannot overwrite a stronger match for the same field.
 */
export function normalizeStructuredObjectKeys(input: Record<string, unknown>) {
  const resolved = new Map<
    keyof StructuredItem,
    { rank: number; value: unknown }
  >();

  for (const [key, value] of Object.entries(input)) {
    const match = resolveStructuredFieldKey(key);
    if (!match) {
      continue;
    }

    const existing = resolved.get(match.field);
    const coercedValue = coerceStructuredFieldValue(match.field, value);

    if (!existing || match.rank > existing.rank) {
      resolved.set(match.field, { rank: match.rank, value: coercedValue });
    }
  }

  return Object.fromEntries(
    Array.from(resolved.entries()).map(([field, entry]) => [
      field,
      entry.value,
    ]),
  ) as Partial<Record<keyof StructuredItem, unknown>>;
}

/**
 * Normalizes optional provider notes without letting non-text metadata break
 * the response shape.
 */
export function normalizeAuxiliaryText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return undefined;
}

function buildJsonCandidates(raw: string): string[] {
  const base = raw.trim();
  const candidates = [
    base,
    stripFence(base),
    stripTrailingCommas(base),
    stripTrailingCommas(stripFence(base)),
  ];

  // Some models wrap the JSON in prose. Extracting the first balanced payload
  // allows retry repair to handle common response wrappers without accepting
  // arbitrary non-JSON text.
  const extracted = extractBalancedJson(base);
  if (extracted) {
    candidates.push(extracted, stripTrailingCommas(extracted));
  }

  return dedupeCandidates(candidates);
}

function dedupeCandidates(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
}

function stripFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```") || !trimmed.endsWith("```")) {
    return trimmed;
  }

  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 2) {
    return trimmed;
  }

  const first = lines[0] ?? "";
  const last = lines[lines.length - 1] ?? "";
  if (!first.startsWith("```") || !last.startsWith("```")) {
    return trimmed;
  }

  return lines.slice(1, -1).join("\n").trim();
}

function stripTrailingCommas(value: string): string {
  return value.replace(/,(\s*[}\]])/g, "$1");
}

function extractBalancedJson(value: string): string | undefined {
  let start = -1;
  let depth = 0;
  const state: JsonScanState = { escaped: false };

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] as string;

    if (start < 0) {
      if (isJsonOpen(char)) {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (consumeQuotedJsonChar(state, char)) {
      continue;
    }

    if (isJsonQuote(char)) {
      state.quote = char;
      continue;
    }

    if (isJsonOpen(char)) {
      depth += 1;
      continue;
    }

    if (!isJsonClose(char)) {
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return value.slice(start, index + 1).trim();
    }
  }

  return undefined;
}

type JsonScanState = {
  quote?: '"' | "'";
  escaped: boolean;
};

function consumeQuotedJsonChar(state: JsonScanState, char: string): boolean {
  if (!state.quote) {
    return false;
  }

  if (state.escaped) {
    state.escaped = false;
    return true;
  }

  if (char === "\\") {
    state.escaped = true;
    return true;
  }

  if (char === state.quote) {
    state.quote = undefined;
  }

  return true;
}

function isJsonQuote(char: string): char is '"' | "'" {
  return char === '"' || char === "'";
}

function isJsonOpen(char: string): boolean {
  return char === "{" || char === "[";
}

function isJsonClose(char: string): boolean {
  return char === "}" || char === "]";
}

function coerceStructuredFieldValue(
  field: keyof StructuredItem,
  value: unknown,
): unknown {
  if (!numericStructuredFields.has(field) || typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().replace(/[ _]/g, "");
  if (!normalized) {
    return value;
  }

  // Only the unambiguous thousands format is rewritten. Locale-specific decimal
  // commas are left untouched so validation can reject them instead of guessing.
  const canonical = /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)
    ? normalized.replace(/,/g, "")
    : normalized;

  if (!/^[-+]?\d+(\.\d+)?$/.test(canonical)) {
    return value;
  }

  const numeric = Number(canonical);
  return Number.isFinite(numeric) ? numeric : value;
}

function resolveStructuredFieldKey(
  key: string,
): { field: keyof StructuredItem; rank: number } | undefined {
  if (structuredFieldNames.includes(key as keyof StructuredItem)) {
    return { field: key as keyof StructuredItem, rank: 4 };
  }

  const token = normalizeToken(key);

  const byToken = structuredFieldTokens.get(token);
  if (byToken) {
    return { field: byToken, rank: 3 };
  }

  const byAlias = structuredFieldAliases.get(token);
  if (byAlias) {
    return { field: byAlias, rank: 2 };
  }

  const byFuzzy = findBestFuzzyField(token);
  if (byFuzzy) {
    return { field: byFuzzy, rank: 1 };
  }

  return undefined;
}

function findBestFuzzyField(token: string): keyof StructuredItem | undefined {
  let bestField: keyof StructuredItem | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  let secondBest = Number.POSITIVE_INFINITY;

  for (const [candidateToken, field] of structuredFieldTokens.entries()) {
    const distance = levenshtein(token, candidateToken);

    if (distance < bestDistance) {
      secondBest = bestDistance;
      bestDistance = distance;
      bestField = field;
      continue;
    }

    if (distance < secondBest) {
      secondBest = distance;
    }
  }

  if (!bestField || !Number.isFinite(bestDistance)) {
    return undefined;
  }

  const limit = allowedDistance(token, normalizeToken(bestField));
  if (bestDistance > limit) {
    return undefined;
  }

  // A tie or near-tie means the repair would be a guess rather than a safe fix.
  if (Number.isFinite(secondBest) && secondBest - bestDistance < 1) {
    return undefined;
  }

  return bestField;
}

function findBestFuzzyKey(
  keys: string[],
  targetToken: string,
  preferredTokens: Set<string>,
): string | undefined {
  let bestKey: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  let secondBest = Number.POSITIVE_INFINITY;

  for (const key of keys) {
    const token = normalizeToken(key);
    const distance =
      preferredTokens.has(token) || token === targetToken
        ? 0
        : levenshtein(token, targetToken);

    if (distance < bestDistance) {
      secondBest = bestDistance;
      bestDistance = distance;
      bestKey = key;
      continue;
    }

    if (distance < secondBest) {
      secondBest = distance;
    }
  }

  if (!bestKey || !Number.isFinite(bestDistance)) {
    return undefined;
  }

  if (bestDistance > allowedDistance(normalizeToken(bestKey), targetToken)) {
    return undefined;
  }

  // Avoid repairing when two provider keys are equally plausible matches.
  if (Number.isFinite(secondBest) && secondBest - bestDistance < 1) {
    return undefined;
  }

  return bestKey;
}

function allowedDistance(left: string, right: string): number {
  const length = Math.max(left.length, right.length);

  if (length <= 4) {
    return 1;
  }

  if (length <= 8) {
    return 2;
  }

  if (length <= 14) {
    return 3;
  }

  return 4;
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshtein(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  const current = new Array<number>(right.length + 1).fill(0);

  for (let i = 0; i < left.length; i += 1) {
    current[0] = i + 1;

    for (let j = 0; j < right.length; j += 1) {
      const cost = left[i] === right[j] ? 0 : 1;
      current[j + 1] = Math.min(
        current[j] + 1,
        previous[j + 1] + 1,
        previous[j] + cost,
      );
    }

    for (let j = 0; j < current.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
}
