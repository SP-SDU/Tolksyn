import { Text, View } from "react-native";

import { BrutalFrame, StatusPill } from "@/components/ui/app-chrome";
import { DiagnosticDisclosure } from "@/components/ui/diagnostic-disclosure";

import {
  formatConfirmLabel,
  formatDiagnosticsSummary,
  formatWebSearchAttemptType,
} from "./format";
import type { ConfirmAttempt } from "./use-session";

type ConfirmWebSearch = NonNullable<
  NonNullable<ConfirmAttempt["extractionResult"]>["webSearchEnrichment"]
>;

export function DiagnosticsEvidence({ attempt }: { attempt: ConfirmAttempt }) {
  const webSearch = attempt.extractionResult?.webSearchEnrichment;
  const extractionAttempts = attempt.extractionDiagnostics?.attempts ?? [];

  if (!extractionAttempts.length && !webSearch) {
    return null;
  }

  return (
    <BrutalFrame className="gap-3">
      <Text className="text-xl font-black uppercase tracking-tight text-foreground">
        Evidence
      </Text>
      <Text className="text-sm font-semibold text-muted">
        {formatDiagnosticsSummary(extractionAttempts.length, webSearch)}
      </Text>
      {webSearch ? <WebSearchSummary webSearch={webSearch} /> : null}
      <DiagnosticDisclosure label="Diagnostics">
        <View className="gap-3">
          {extractionAttempts.map((item) => (
            <ExtractionAttempt
              key={`${item.attempt}-${item.error ?? "ok"}`}
              item={item}
            />
          ))}
          {webSearch?.attempts.map((item, index) => (
            <WebSearchAttempt key={`${item.type}-${index}`} item={item} />
          ))}
          {webSearch?.queries.map((query) => (
            <Text key={query} className="text-sm font-semibold text-muted">
              Query: {query}
            </Text>
          ))}
          {webSearch?.sources.map((source) => (
            <SourceEvidence key={source.url} source={source} />
          ))}
        </View>
      </DiagnosticDisclosure>
    </BrutalFrame>
  );
}

function WebSearchSummary({ webSearch }: { webSearch: ConfirmWebSearch }) {
  return (
    <>
      <Text className="text-sm font-black uppercase tracking-wide text-foreground">
        Manufacturer Websearch
      </Text>
      <StatusPill
        label={
          webSearch.failed
            ? "Failed"
            : webSearch.skipped
              ? "Skipped"
              : "Completed"
        }
        tone={webSearch.failed ? "danger" : "success"}
      />
      {webSearch.skipReason ? (
        <Text className="text-sm font-semibold text-muted">
          Reason: {webSearch.skipReason}
        </Text>
      ) : null}
      {webSearch.error ? (
        <Text className="text-sm font-semibold text-danger">
          Error: {webSearch.error}
        </Text>
      ) : null}
      <WebSearchFieldChanges webSearch={webSearch} />
    </>
  );
}

function WebSearchFieldChanges({ webSearch }: { webSearch: ConfirmWebSearch }) {
  if (webSearch.fieldChanges.length) {
    return webSearch.fieldChanges.map((change) => (
      <View
        key={`${change.field}-${String(change.after)}`}
        className="gap-1.5 border-2 border-border bg-paper px-3 py-2"
      >
        <Text className="text-xs font-black uppercase tracking-wide text-foreground">
          Changed: {formatConfirmLabel(change.field)}
        </Text>
        <Text selectable className="text-xs font-semibold text-muted">
          Original: {change.before == null ? "null" : String(change.before)}
        </Text>
        <Text selectable className="text-xs font-semibold text-muted">
          Web-updated: {change.after == null ? "null" : String(change.after)}
        </Text>
        {change.reason ? (
          <Text selectable className="text-xs font-semibold text-muted">
            Reason: {change.reason}
          </Text>
        ) : null}
        {change.evidenceUrls.length ? (
          <Text selectable className="text-xs font-semibold text-muted">
            Evidence: {change.evidenceUrls.join(", ")}
          </Text>
        ) : null}
      </View>
    ));
  }

  return (
    <Text className="text-sm font-semibold text-muted">
      No fields changed by websearch.
    </Text>
  );
}

function ExtractionAttempt({
  item,
}: {
  item: NonNullable<
    ConfirmAttempt["extractionDiagnostics"]
  >["attempts"][number];
}) {
  return (
    <View className="gap-1.5 border-2 border-border bg-panel px-3 py-2">
      <Text className="text-xs font-black uppercase tracking-wide text-foreground">
        Attempt {item.attempt}
      </Text>
      {item.error ? (
        <Text className="text-xs font-semibold text-danger">
          Error: {item.error}
        </Text>
      ) : (
        <Text className="text-xs font-semibold text-signalBlue">Success</Text>
      )}
      <Text selectable className="text-xs font-semibold text-muted">
        Prompt: {item.prompt}
      </Text>
      {item.responseText ? (
        <Text selectable className="text-xs font-semibold text-muted">
          Response: {item.responseText}
        </Text>
      ) : null}
    </View>
  );
}

function WebSearchAttempt({
  item,
}: {
  item: ConfirmWebSearch["attempts"][number];
}) {
  return (
    <View className="gap-1.5 border-2 border-border bg-panel px-3 py-2">
      <Text className="text-xs font-black uppercase tracking-wide text-foreground">
        Websearch {formatWebSearchAttemptType(item.type)}
      </Text>
      <Text
        className={
          item.status === "failed"
            ? "text-xs font-semibold text-danger"
            : "text-xs font-semibold text-signalBlue"
        }
      >
        {item.status === "failed" ? "Failed" : "Success"}
      </Text>
      {(
        ["query", "url", "prompt", "responseText", "excerpt", "error"] as const
      ).map((key) => {
        const value = item[key];
        if (!value) return null;
        return (
          <Text
            key={key}
            selectable
            className={
              key === "error"
                ? "text-xs font-semibold text-danger"
                : "text-xs font-semibold text-muted"
            }
          >
            {formatConfirmLabel(key)}: {value}
          </Text>
        );
      })}
    </View>
  );
}

function SourceEvidence({
  source,
}: {
  source: ConfirmWebSearch["sources"][number];
}) {
  return (
    <View className="gap-1.5 border-2 border-border bg-panel px-3 py-2">
      <Text
        selectable
        className="text-xs font-black uppercase tracking-wide text-foreground"
      >
        Source: {source.url}
      </Text>
      <Text selectable className="text-xs font-semibold text-muted">
        Excerpt: {source.excerpt}
      </Text>
    </View>
  );
}
