import type { RemoteExtractionResult } from '@/api/providers/remote-extraction-types';
import type { AppSettings } from '@/types/settings';
import type { StructuredItem } from '@/types/item-schema';
import type { BarcodeHit, WebSearchEnrichment } from '@/utils/merge-extraction-result';
import { extractUrlsFromText, type ExaSearchInput } from '@/services/exa-websearch';
import { sanitizeSearchQuery, sanitizeUntrustedWebText } from '@/services/web-safety';
import type { WebFetchResult } from '@/services/webfetch';

type ImageInput = {
  imageUri: string;
  imageBase64: string;
  mimeType: string;
  width: number;
  height: number;
};

type EnrichmentInput = ImageInput & {
  structuredJson: StructuredItem;
  barcodes: BarcodeHit[];
  auxiliaryText?: string;
  responseText?: string;
};

type WebSearchAttempt = WebSearchEnrichment['attempts'][number];

const WEBSEARCH_LIMITS = {
  maxQueries: 3,
  maxFetchedPagesTotal: 6,
};

export function createManufacturerWebSearchEnricher({
  settings,
  extractor,
  webSearch,
  webFetch,
}: {
  settings: { getSettings(): Promise<AppSettings> };
  extractor: {
    extract(input: ImageInput & { prompt?: string }): Promise<RemoteExtractionResult>;
  };
  webSearch: { search(input: ExaSearchInput): Promise<string> };
  webFetch: { fetch(input: { url: string }): Promise<WebFetchResult> };
}) {
  return {
    async enrich(input: EnrichmentInput): Promise<{ structuredJson: StructuredItem; diagnostics: WebSearchEnrichment } | undefined> {
      if (!(await settings.getSettings()).webSearch.enabled) {
        return undefined;
      }

      const startedAt = Date.now();
      const attempts: WebSearchAttempt[] = [];
      const planned = await planQueries({ extractor, input });
      attempts.push(planned.attempt);
      const queries = planned.queries;
      if (!queries.length) {
        return {
          structuredJson: input.structuredJson,
          diagnostics: {
            enabled: true,
            attempts,
            queries: [],
            searchResults: [],
            sources: [],
            fieldChanges: [],
            conflicts: [],
            failed: false,
            skipped: true,
            skipReason: 'Query planner returned no queries.',
            durationMs: Math.max(1, Date.now() - startedAt),
          },
        };
      }

      const searchResults = await Promise.all(
        queries.map(async (query) => {
          const safeQuery = sanitizeSearchQuery(query);
          const output = sanitizeUntrustedWebText(await webSearch.search({ query: safeQuery }));
          attempts.push({
            type: 'exa_search',
            status: 'success',
            query: safeQuery,
            responseText: output,
          });
          return {
            query: safeQuery,
            output,
            urls: extractUrlsFromText(output),
          };
        }),
      );
      const sources = await fetchSources({ webFetch, attempts, urls: uniqueUrls(searchResults.flatMap((result) => result.urls)).slice(0, WEBSEARCH_LIMITS.maxFetchedPagesTotal) });
      const reconciliationPrompt = buildReconciliationPrompt(input.structuredJson, input.barcodes, searchResults, sources);
      const reconciled = await extractor.extract({
        imageUri: input.imageUri,
        imageBase64: input.imageBase64,
        mimeType: input.mimeType,
        width: input.width,
        height: input.height,
        prompt: reconciliationPrompt,
      });
      attempts.push({
        type: 'reconciliation',
        status: 'success',
        prompt: reconciliationPrompt,
        responseText: reconciled.responseText ?? reconciled.auxiliaryText,
      });
      const parsedDiagnostics = parseReconciliationDiagnostics(reconciled.auxiliaryText);

      return {
        structuredJson: reconciled.structuredJson,
        diagnostics: {
          enabled: true,
          attempts,
          queries,
          searchResults,
          sources: sources.map((source) => ({
            url: source.url,
            contentType: source.contentType,
            excerpt: excerpt(source.text),
          })),
          fieldChanges: parsedDiagnostics.fieldChanges.length
            ? parsedDiagnostics.fieldChanges
            : changedStructuredFields(input.structuredJson, reconciled.structuredJson),
          conflicts: parsedDiagnostics.conflicts,
          failed: false,
          durationMs: Math.max(1, Date.now() - startedAt),
        },
      };
    },
  };
}

async function planQueries({
  extractor,
  input,
}: {
  extractor: { extract(input: ImageInput & { prompt?: string }): Promise<RemoteExtractionResult> };
  input: EnrichmentInput;
}): Promise<{ queries: string[]; attempt: WebSearchAttempt }> {
  const prompt = buildQueryPlanningPrompt(input.structuredJson, input.barcodes, input.auxiliaryText, input.responseText);
  try {
    const planned = await extractor.extract({
      imageUri: input.imageUri,
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      prompt,
    });

    return {
      queries: parseQueries(planned.responseText ?? planned.auxiliaryText).slice(0, WEBSEARCH_LIMITS.maxQueries),
      attempt: {
        type: 'query_planning',
        status: parseQueries(planned.responseText ?? planned.auxiliaryText).length ? 'success' : 'failed',
        prompt,
        responseText: planned.responseText ?? planned.auxiliaryText,
      },
    };
  } catch (error) {
    return {
      queries: [],
      attempt: {
        type: 'query_planning',
        status: 'failed',
        prompt,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function buildQueryPlanningPrompt(
  structuredJson: StructuredItem,
  barcodes: BarcodeHit[],
  auxiliaryText?: string,
  responseText?: string,
): string {
  return [
    'Create web search queries for manufacturer and product verification.',
    'Return one single complete valid JSON object only using the standard structured_json and auxiliary_text_optional envelope.',
    'Keep structured_json equal to the provided original structured_json.',
    'Put query JSON in auxiliary_text_optional exactly like {"queries":["query one","query two"]}.',
    `Use at most ${WEBSEARCH_LIMITS.maxQueries} queries. Prefer official manufacturer, datasheet, product page, and barcode lookup queries.`,
    'Original structured_json:',
    JSON.stringify(structuredJson),
    'Detected barcodes:',
    JSON.stringify(barcodes),
    'Auxiliary text:',
    auxiliaryText ?? '',
    'Original model response:',
    responseText ?? '',
  ].join(' ');
}

function buildReconciliationPrompt(
  structuredJson: StructuredItem,
  barcodes: BarcodeHit[],
  searchResults: { query: string; output: string; urls: string[] }[],
  sources: WebFetchResult[],
): string {
  return [
    'Update product label extraction using web search evidence.',
    'Return one single complete valid JSON object only using the standard structured_json and auxiliary_text_optional envelope.',
    'Original label/image extraction and detected barcodes are primary evidence.',
    'Prefer original label-derived facts over web results.',
    'Use web results only to fill null or ambiguous fields, or when official manufacturer/product evidence clearly corroborates a correction.',
    'If web evidence conflicts with label evidence, keep the original value and mention the conflict in auxiliary_text_optional.',
    'Original structured_json:',
    JSON.stringify(structuredJson),
    'Detected barcodes:',
    JSON.stringify(barcodes),
    'Exa web search results:',
    JSON.stringify(searchResults),
    'Fetched source page content:',
    JSON.stringify(sources.map((source) => ({ url: source.url, contentType: source.contentType, excerpt: excerpt(source.text) }))),
    'Put a JSON object in auxiliary_text_optional exactly like {"fieldChanges":[{"field":"manufacturer","before":null,"after":"Phoenix Contact","evidenceUrls":["https://example.com"],"reason":"Official page evidence"}],"conflicts":[]}.',
  ].join(' ');
}

function parseQueries(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    return parseQueryRecord(JSON.parse(value));
  } catch {
    return [];
  }
}

function parseQueryRecord(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  const parsed = value as { queries?: unknown; auxiliary_text_optional?: unknown };
  if (Array.isArray(parsed.queries)) {
    return parsed.queries
      .map((query) => String(query).trim())
      .filter(Boolean);
  }

  if (typeof parsed.auxiliary_text_optional === 'string') {
    return parseQueries(parsed.auxiliary_text_optional);
  }

  return parseQueryRecord(parsed.auxiliary_text_optional);
}

function changedStructuredFields(before: StructuredItem, after: StructuredItem): WebSearchEnrichment['fieldChanges'] {
  return Object.keys(after)
    .filter((field) => before[field as keyof StructuredItem] !== after[field as keyof StructuredItem])
    .map((field) => ({
      field,
      before: before[field as keyof StructuredItem],
      after: after[field as keyof StructuredItem],
      evidenceUrls: [],
    }));
}

async function fetchSources({
  webFetch,
  attempts,
  urls,
}: {
  webFetch: { fetch(input: { url: string }): Promise<WebFetchResult> };
  attempts: WebSearchAttempt[];
  urls: string[];
}): Promise<WebFetchResult[]> {
  const results = await Promise.allSettled(urls.map((url) => webFetch.fetch({ url })));
  results.forEach((result, index) => {
    const url = urls[index];
    if (result.status === 'fulfilled') {
      attempts.push({
        type: 'webfetch',
        status: 'success',
        url,
        excerpt: excerpt(result.value.text),
      });
      return;
    }

    attempts.push({
      type: 'webfetch',
      status: 'failed',
      url,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  });

  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

function parseReconciliationDiagnostics(value: string | undefined): Pick<WebSearchEnrichment, 'fieldChanges' | 'conflicts'> {
  if (!value) {
    return { fieldChanges: [], conflicts: [] };
  }

  try {
    const parsed = JSON.parse(value) as {
      fieldChanges?: unknown;
      conflicts?: unknown;
    };

    return {
      fieldChanges: Array.isArray(parsed.fieldChanges)
        ? parsed.fieldChanges
            .map((item) => normalizeFieldChange(item))
            .filter((item): item is WebSearchEnrichment['fieldChanges'][number] => Boolean(item))
        : [],
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts.map((item) => normalizeConflict(item)).filter(Boolean) : [],
    };
  } catch {
    return { fieldChanges: [], conflicts: [] };
  }
}

function normalizeConflict(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return String(value);
  }

  const record = value as Record<string, unknown>;
  const field = typeof record.field === 'string' ? record.field : 'Conflict';
  const parts = [field];
  if (typeof record.reason === 'string' && record.reason.trim().length > 0) {
    parts.push(record.reason.trim().replace(/[.。]+$/g, ''));
  }
  if (record.labelValue != null) {
    parts.push(`Label: ${String(record.labelValue)}`);
  }
  if (record.webValue != null) {
    parts.push(`Web: ${String(record.webValue)}`);
  }

  return `${parts[0]}: ${parts.slice(1).join('. ')}.`;
}

function normalizeFieldChange(value: unknown): WebSearchEnrichment['fieldChanges'][number] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.field !== 'string') {
    return null;
  }

  return {
    field: record.field,
    before: normalizeFieldValue(record.before),
    after: normalizeFieldValue(record.after),
    evidenceUrls: Array.isArray(record.evidenceUrls) ? record.evidenceUrls.map((item) => String(item)) : [],
    reason: typeof record.reason === 'string' ? record.reason : undefined,
  };
}

function normalizeFieldValue(value: unknown): string | number | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }

  return String(value);
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

function excerpt(text: string): string {
  return sanitizeUntrustedWebText(text, 1200);
}
