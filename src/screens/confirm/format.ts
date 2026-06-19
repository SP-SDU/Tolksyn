import type { WebSearchEnrichment } from "@/types/extraction";

export function formatConfirmLabel(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (match) => match.toUpperCase());
}

export function formatWebSearchAttemptType(value: string) {
  return formatConfirmLabel(value.replace(/_/g, " "));
}

export function formatDiagnosticsSummary(
  extractionAttemptCount: number,
  webSearch: WebSearchEnrichment | undefined,
) {
  const parts = [
    `${extractionAttemptCount} extraction ${extractionAttemptCount === 1 ? "attempt" : "attempts"}`,
  ];
  if (webSearch) {
    parts.push(
      `${webSearch.attempts.length} websearch ${webSearch.attempts.length === 1 ? "step" : "steps"}`,
    );
  }

  return parts.join(", ");
}
