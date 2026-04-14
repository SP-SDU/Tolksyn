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

      {currentAttempt.extractionDiagnostics?.attempts?.length ? (
        <Section title="Extraction attempts">
          {currentAttempt.extractionDiagnostics.attempts.map((item) => (
            <View key={`${item.attempt}-${item.error ?? 'ok'}`} className="gap-1.5 rounded-xl border border-border px-3 py-2">
              <Text className="text-xs font-semibold text-slate-700">Attempt {item.attempt}</Text>
              {item.error ? <Text className="text-xs text-red-700">Error: {item.error}</Text> : <Text className="text-xs text-emerald-700">Success</Text>}
              <Text className="text-xs text-slate-600">Prompt: {item.prompt.slice(0, 280)}</Text>
              {item.responseText ? <Text className="text-xs text-slate-600">Response: {item.responseText.slice(0, 280)}</Text> : null}
            </View>
          ))}
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
