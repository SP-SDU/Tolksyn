import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen, ScreenTitle } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { useAppRuntime } from '@/providers/app-provider';
import { getErrorMessage } from '@/types/app-error';
import type { StructuredItem } from '@/types/item-schema';
import { emptyStructuredItem } from '@/types/item-schema';
import type { WebSearchEnrichment } from '@/utils/merge-extraction-result';

const numericFields = new Set([
  'quantity',
  'batchSize',
  'priceEur',
  'weightKg',
  'heightMm',
  'widthMm',
  'lengthMm',
]);

export function ConfirmScreen({ attemptId }: { attemptId: string }) {
  const runtime = useAppRuntime();
  const router = useRouter();
  const [attempt, setAttempt] = useState<Awaited<ReturnType<typeof runtime.attempts.getById>>>(null);
  const [draft, setDraft] = useState<StructuredItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void runtime.attempts.getById(attemptId).then((next) => {
        if (!active) {
          return;
        }

        setAttempt(next);
        const fallbackDraft = next?.extractionDiagnostics?.failed ? emptyStructuredItem() : null;
        setDraft((next?.draftStructuredJson ?? next?.extractionResult?.structuredJson ?? fallbackDraft) as StructuredItem | null);
      });

      return () => {
        active = false;
      };
    }, [attemptId, runtime]),
  );

  const editableFields = useMemo(() => Object.entries(draft ?? {}), [draft]);

  if (!attempt) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted">Attempt not found.</Text>
      </View>
    );
  }

  if (!draft) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-center text-muted">Extraction result is unavailable for this attempt.</Text>
        <View className="mt-4 w-full max-w-xs gap-2">
          <Button variant="secondary" label="Back" onPress={() => router.replace('/')} />
          <Button label="Try Again" onPress={handleTryAgain} />
        </View>
      </View>
    );
  }

  const currentAttempt = attempt;
  const currentDraft = draft;
  const webSearch = currentAttempt.extractionResult?.webSearchEnrichment;
  const extractionAttempts = currentAttempt.extractionDiagnostics?.attempts ?? [];

  async function handleAccept() {
    setIsSubmitting(true);
    try {
      await runtime.attempts.saveDraft(currentAttempt.id, currentDraft);
      const result = await runtime.submitAttempt({
        attemptId: currentAttempt.id,
        acceptedRevision: currentAttempt.acceptedRevision + 1,
        payload: {
          schemaVersion: 'tolksyn.item.v1',
          attemptId: currentAttempt.id,
          acceptedRevision: currentAttempt.acceptedRevision + 1,
          structuredJson: currentDraft,
          barcodeEnrichment: currentAttempt.extractionResult?.barcodeEnrichment ?? {
            detected: [],
            primary: null,
            relatedFieldSuggestions: { eanOrUpc: null },
            conflicts: [],
          },
          auxiliaryText: currentAttempt.extractionResult?.auxiliaryText,
          metadata: {
            source: currentAttempt.source,
            provider: currentAttempt.extractionResult?.metadata.provider,
          },
        },
      });

      Alert.alert(result.outcome === 'sent' ? 'Sent' : 'Queued', `Idempotency key: ${result.idempotencyKey}`);
      router.replace('/');
    } catch (error) {
      Alert.alert('Submit failed', getErrorMessage(error, 'Unable to submit this attempt.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTryAgain() {
    try {
      const result = await runtime.processImage({
        source: currentAttempt.source,
        inputUri: currentAttempt.imageUri,
      });
      router.replace({ pathname: '/confirm/[attemptId]', params: { attemptId: result.attemptId } });
    } catch (error) {
      Alert.alert('Retry failed', getErrorMessage(error, 'Unable to retry extraction for this image.'));
    }
  }

  return (
    <Screen className="gap-4">
      <ScreenTitle title="Confirm & Edit" />
      <Image
        source={currentAttempt.imageUri}
        className="h-[220px] w-full rounded-3xl bg-slate-200"
        contentFit="cover"
      />

      <Section title="Structured JSON">
        {currentAttempt.extractionDiagnostics?.failed ? (
          <Text className="text-sm text-amber-700">
            VLM extraction failed. Fields are defaulted to null so you can edit and continue manually.
          </Text>
        ) : null}
        {editableFields.map(([key, value]) => (
          <View key={key} className="gap-1.5">
            <Text className="text-sm font-semibold text-slate-700">{formatLabel(key)}</Text>
            <Input
              multiline
              value={value == null ? '' : String(value)}
              onChangeText={(nextValue) =>
                setDraft((current) => {
                  if (!current) {
                    return current;
                  }

                  return {
                    ...current,
                    [key]: numericFields.has(key) ? (nextValue.length === 0 ? null : Number(nextValue)) : nextValue,
                  } as StructuredItem;
                })
              }
            />
          </View>
        ))}
      </Section>

      <Section title="Barcode enrichment">
        <Text className="text-sm text-muted">
          Suggested EAN/UPC: {currentAttempt.extractionResult?.barcodeEnrichment.relatedFieldSuggestions.eanOrUpc ?? 'None'}
        </Text>
        {(currentAttempt.extractionResult?.barcodeEnrichment.detected ?? []).map((barcode) => (
          <Text key={`${barcode.type}:${barcode.data}`} className="text-sm text-muted">
            {barcode.type}: {barcode.data}
          </Text>
        ))}
      </Section>

      {extractionAttempts.length || webSearch ? (
        <Section title="Extraction attempts">
          <Text className="text-sm text-muted">
            {formatDiagnosticsSummary(extractionAttempts.length, webSearch)}
          </Text>
          {webSearch ? <Text className="text-sm font-semibold text-slate-700">Manufacturer websearch</Text> : null}
          {webSearch ? (
            <Text className="text-sm text-muted">Status: {webSearch.failed ? 'Failed' : webSearch.skipped ? 'Skipped' : 'Completed'}</Text>
          ) : null}
          {webSearch?.skipReason ? <Text className="text-sm text-muted">Reason: {webSearch.skipReason}</Text> : null}
          {webSearch?.error ? <Text className="text-sm text-red-700">Error: {webSearch.error}</Text> : null}
          {webSearch?.fieldChanges.length ? (
            webSearch.fieldChanges.map((change) => (
              <View key={`${change.field}-${String(change.after)}`} className="gap-1.5 rounded-xl border border-border px-3 py-2">
                <Text className="text-xs font-semibold text-slate-700">Changed field: {formatLabel(change.field)}</Text>
                <Text selectable className="text-xs text-slate-600">Original: {change.before == null ? 'null' : String(change.before)}</Text>
                <Text selectable className="text-xs text-slate-600">Web-updated: {change.after == null ? 'null' : String(change.after)}</Text>
                {change.reason ? <Text selectable className="text-xs text-slate-600">Reason: {change.reason}</Text> : null}
                {change.evidenceUrls.length ? <Text selectable className="text-xs text-slate-600">Evidence: {change.evidenceUrls.join(', ')}</Text> : null}
              </View>
            ))
          ) : webSearch ? (
            <Text className="text-sm text-muted">No fields changed by websearch.</Text>
          ) : null}
          {webSearch?.conflicts.length ? (
            webSearch.conflicts.map((conflict) => (
              <Text key={conflict} className="text-sm text-amber-700">Conflict: {conflict}</Text>
            ))
          ) : null}
          <Button
            variant="secondary"
            label={showDiagnostics ? 'Hide diagnostics' : 'Show diagnostics'}
            onPress={() => setShowDiagnostics((current) => !current)}
          />
          {showDiagnostics ? (
            <View className="gap-3">
              {extractionAttempts.map((item) => (
                <View key={`${item.attempt}-${item.error ?? 'ok'}`} className="gap-1.5 rounded-xl border border-border px-3 py-2">
                  <Text className="text-xs font-semibold text-slate-700">Attempt {item.attempt}</Text>
                  {item.error ? <Text className="text-xs text-red-700">Error: {item.error}</Text> : <Text className="text-xs text-emerald-700">Success</Text>}
                  <Text selectable className="text-xs text-slate-600">Prompt: {item.prompt}</Text>
                  {item.responseText ? <Text selectable className="text-xs text-slate-600">Response: {item.responseText}</Text> : null}
                </View>
              ))}
              {webSearch?.attempts.map((item, index) => (
                <View key={`${item.type}-${index}`} className="gap-1.5 rounded-xl border border-border px-3 py-2">
                  <Text className="text-xs font-semibold text-slate-700">Websearch {formatWebSearchAttemptType(item.type)}</Text>
                  <Text className={item.status === 'failed' ? 'text-xs text-red-700' : 'text-xs text-emerald-700'}>
                    {item.status === 'failed' ? 'Failed' : 'Success'}
                  </Text>
                  {item.query ? <Text selectable className="text-xs text-slate-600">Query: {item.query}</Text> : null}
                  {item.url ? <Text selectable className="text-xs text-slate-600">URL: {item.url}</Text> : null}
                  {item.prompt ? <Text selectable className="text-xs text-slate-600">Prompt: {item.prompt}</Text> : null}
                  {item.responseText ? <Text selectable className="text-xs text-slate-600">Response: {item.responseText}</Text> : null}
                  {item.excerpt ? <Text selectable className="text-xs text-slate-600">Excerpt: {item.excerpt}</Text> : null}
                  {item.error ? <Text selectable className="text-xs text-red-700">Error: {item.error}</Text> : null}
                </View>
              ))}
              {webSearch?.queries.map((query) => (
                <Text key={query} className="text-sm text-muted">Query: {query}</Text>
              ))}
              {webSearch?.sources.map((source) => (
                <View key={source.url} className="gap-1.5 rounded-xl border border-border px-3 py-2">
                  <Text selectable className="text-xs font-semibold text-slate-700">Source: {source.url}</Text>
                  <Text selectable className="text-xs text-slate-600">Excerpt: {source.excerpt}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Section>
      ) : null}

      <View className="flex-row gap-2">
        <Button variant="secondary" className="flex-1" label="Discard" onPress={() => router.replace('/')} />
        <Button variant="secondary" className="flex-1" label="Try Again" onPress={handleTryAgain} />
        <Button
          className="flex-1"
          disabled={isSubmitting}
          label={isSubmitting ? 'Sending…' : 'Accept'}
          onPress={handleAccept}
        />
      </View>
    </Screen>
  );
}

function formatLabel(value: string) {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (match) => match.toUpperCase());
}

function formatWebSearchAttemptType(value: string) {
  return formatLabel(value.replace(/_/g, ' '));
}

function formatDiagnosticsSummary(extractionAttemptCount: number, webSearch: WebSearchEnrichment | undefined) {
  const parts = [`${extractionAttemptCount} extraction ${extractionAttemptCount === 1 ? 'attempt' : 'attempts'}`];
  if (webSearch) {
    parts.push(`${webSearch.attempts.length} websearch ${webSearch.attempts.length === 1 ? 'step' : 'steps'}`);
  }

  return parts.join(', ');
}
