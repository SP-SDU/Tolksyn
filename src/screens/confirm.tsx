import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { ImagePreview } from '@/components/image-preview';
import { AppHeader, BrutalFrame, FieldRow, StatusPill, StickyActionBar } from '@/components/ui/app-chrome';
import { Button } from '@/components/ui/button';
import { DiagnosticDisclosure } from '@/components/ui/diagnostic-disclosure';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
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
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

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
        <Text className="text-sm font-black uppercase tracking-wide text-muted">Attempt not found.</Text>
      </View>
    );
  }

  if (!draft) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-center text-sm font-black uppercase tracking-wide text-muted">
          Extraction result is unavailable for this attempt.
        </Text>
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
  const detectedBarcodes = currentAttempt.extractionResult?.barcodeEnrichment.detected ?? [];
  const suggestedBarcode = currentAttempt.extractionResult?.barcodeEnrichment.relatedFieldSuggestions.eanOrUpc ?? 'None';

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
    setIsRetrying(true);
    try {
      const result = await runtime.processImage({
        source: currentAttempt.source,
        inputUri: currentAttempt.imageUri,
      });
      router.replace({ pathname: '/confirm/[attemptId]', params: { attemptId: result.attemptId } });
    } catch (error) {
      Alert.alert('Retry failed', getErrorMessage(error, 'Unable to retry extraction for this image.'));
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleDiscard() {
    setIsDiscarding(true);
    try {
      await runtime.attempts.deleteById(currentAttempt.id);
      router.replace('/');
    } catch (error) {
      Alert.alert('Discard failed', getErrorMessage(error, 'Unable to discard this attempt.'));
    } finally {
      setIsDiscarding(false);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <Screen className="gap-4 pb-32">
        <AppHeader
          eyebrow="Step 2"
          title="Verify"
          meta="Edit the extraction. Accept only when the record is clean."
        />

        <View className="gap-3">
          <ImagePreview
            uri={currentAttempt.imageUri}
            accessibilityLabel={`Captured product label image for attempt ${currentAttempt.id}`}
            className="h-[220px] w-full border-4 border-border bg-imageBase"
            contentFit="cover"
          />
          <BrutalFrame className="gap-2 bg-paper">
            <View className="flex-row flex-wrap gap-2">
              <StatusPill label={currentAttempt.status} tone={currentAttempt.status.endsWith('_failed') ? 'danger' : 'default'} />
              <StatusPill label={currentAttempt.source} tone="info" />
              <StatusPill label={`Rev ${currentAttempt.acceptedRevision + 1}`} tone="warning" />
            </View>
            <FieldRow label="Attempt" value={currentAttempt.id} />
            <FieldRow label="Created" value={new Date(currentAttempt.createdAt).toLocaleString()} />
          </BrutalFrame>
        </View>

        <BrutalFrame className="gap-4">
          <Text className="text-xl font-black uppercase tracking-tight text-foreground">Structured Record</Text>
        {currentAttempt.extractionDiagnostics?.failed ? (
          <Text className="border-2 border-border bg-caution p-3 text-sm font-black uppercase tracking-wide text-foreground">
            VLM extraction failed. Fields are defaulted to null so you can edit and continue manually.
          </Text>
        ) : null}
        {editableFields.map(([key, value]) => (
          <View key={key} className="gap-1.5">
            <Text className="text-xs font-black uppercase tracking-wide text-foreground">{formatLabel(key)}</Text>
            <Input
              multiline
              accessibilityLabel={formatLabel(key)}
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
        </BrutalFrame>

        <BrutalFrame className="gap-3 bg-paper">
          <Text className="text-xl font-black uppercase tracking-tight text-foreground">Barcode</Text>
          <FieldRow label="Suggested EAN/UPC" value={suggestedBarcode} />
          {detectedBarcodes.length ? (
            detectedBarcodes.map((barcode) => (
              <FieldRow key={`${barcode.type}:${barcode.data}`} label={barcode.type} value={barcode.data} />
            ))
          ) : (
            <Text className="text-sm font-semibold text-muted">No barcode was detected.</Text>
          )}
        </BrutalFrame>

        {extractionAttempts.length > 0 || webSearch ? (
          <BrutalFrame className="gap-3">
            <Text className="text-xl font-black uppercase tracking-tight text-foreground">Evidence</Text>
            <Text className="text-sm font-semibold text-muted">
              {formatDiagnosticsSummary(extractionAttempts.length, webSearch)}
            </Text>
            {webSearch ? <Text className="text-sm font-black uppercase tracking-wide text-foreground">Manufacturer Websearch</Text> : null}
            {webSearch ? (
              <StatusPill label={webSearch.failed ? 'Failed' : webSearch.skipped ? 'Skipped' : 'Completed'} tone={webSearch.failed ? 'danger' : 'success'} />
            ) : null}
            {webSearch?.skipReason ? <Text className="text-sm font-semibold text-muted">Reason: {webSearch.skipReason}</Text> : null}
            {webSearch?.error ? <Text className="text-sm font-semibold text-danger">Error: {webSearch.error}</Text> : null}
          {webSearch?.fieldChanges.length ? (
            webSearch.fieldChanges.map((change) => (
              <View key={`${change.field}-${String(change.after)}`} className="gap-1.5 border-2 border-border bg-paper px-3 py-2">
                <Text className="text-xs font-black uppercase tracking-wide text-foreground">Changed: {formatLabel(change.field)}</Text>
                <Text selectable className="text-xs font-semibold text-muted">Original: {change.before == null ? 'null' : String(change.before)}</Text>
                <Text selectable className="text-xs font-semibold text-muted">Web-updated: {change.after == null ? 'null' : String(change.after)}</Text>
                {change.reason ? <Text selectable className="text-xs font-semibold text-muted">Reason: {change.reason}</Text> : null}
                {change.evidenceUrls.length ? <Text selectable className="text-xs font-semibold text-muted">Evidence: {change.evidenceUrls.join(', ')}</Text> : null}
              </View>
            ))
          ) : webSearch ? (
            <Text className="text-sm font-semibold text-muted">No fields changed by websearch.</Text>
          ) : null}
          {webSearch?.conflicts.length ? (
            webSearch.conflicts.map((conflict) => (
              <Text key={conflict} className="text-sm font-semibold text-danger">Conflict: {conflict}</Text>
            ))
          ) : null}
          <DiagnosticDisclosure label="Diagnostics">
            <View className="gap-3">
              {extractionAttempts.map((item) => (
                <View key={`${item.attempt}-${item.error ?? 'ok'}`} className="gap-1.5 border-2 border-border bg-panel px-3 py-2">
                  <Text className="text-xs font-black uppercase tracking-wide text-foreground">Attempt {item.attempt}</Text>
                  {item.error ? <Text className="text-xs font-semibold text-danger">Error: {item.error}</Text> : <Text className="text-xs font-semibold text-signalBlue">Success</Text>}
                  <Text selectable className="text-xs font-semibold text-muted">Prompt: {item.prompt}</Text>
                  {item.responseText ? <Text selectable className="text-xs font-semibold text-muted">Response: {item.responseText}</Text> : null}
                </View>
              ))}
              {webSearch?.attempts.map((item, index) => (
                <View key={`${item.type}-${index}`} className="gap-1.5 border-2 border-border bg-panel px-3 py-2">
                  <Text className="text-xs font-black uppercase tracking-wide text-foreground">Websearch {formatWebSearchAttemptType(item.type)}</Text>
                  <Text className={item.status === 'failed' ? 'text-xs font-semibold text-danger' : 'text-xs font-semibold text-signalBlue'}>
                    {item.status === 'failed' ? 'Failed' : 'Success'}
                  </Text>
                  {item.query ? <Text selectable className="text-xs font-semibold text-muted">Query: {item.query}</Text> : null}
                  {item.url ? <Text selectable className="text-xs font-semibold text-muted">URL: {item.url}</Text> : null}
                  {item.prompt ? <Text selectable className="text-xs font-semibold text-muted">Prompt: {item.prompt}</Text> : null}
                  {item.responseText ? <Text selectable className="text-xs font-semibold text-muted">Response: {item.responseText}</Text> : null}
                  {item.excerpt ? <Text selectable className="text-xs font-semibold text-muted">Excerpt: {item.excerpt}</Text> : null}
                  {item.error ? <Text selectable className="text-xs font-semibold text-danger">Error: {item.error}</Text> : null}
                </View>
              ))}
              {webSearch?.queries.map((query) => (
                <Text key={query} className="text-sm font-semibold text-muted">Query: {query}</Text>
              ))}
              {webSearch?.sources.map((source) => (
                <View key={source.url} className="gap-1.5 border-2 border-border bg-panel px-3 py-2">
                  <Text selectable className="text-xs font-black uppercase tracking-wide text-foreground">Source: {source.url}</Text>
                  <Text selectable className="text-xs font-semibold text-muted">Excerpt: {source.excerpt}</Text>
                </View>
              ))}
            </View>
          </DiagnosticDisclosure>
          </BrutalFrame>
        ) : null}
      </Screen>

      <StickyActionBar className="absolute bottom-0 left-0 right-0">
        <View className="flex-row gap-2">
          <Button variant="secondary" className="flex-1" disabled={isSubmitting || isRetrying || isDiscarding} label={isDiscarding ? 'Discarding…' : 'Discard'} onPress={handleDiscard} />
          <Button variant="secondary" className="flex-1" disabled={isSubmitting || isRetrying || isDiscarding} label={isRetrying ? 'Retrying…' : 'Retry'} onPress={handleTryAgain} />
          <Button
            className="flex-1"
            disabled={isSubmitting || isRetrying || isDiscarding}
            label={isSubmitting ? 'Sending…' : 'Accept'}
            onPress={handleAccept}
          />
        </View>
      </StickyActionBar>
    </View>
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
