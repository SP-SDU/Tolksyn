import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen, ScreenTitle } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { useAppRuntime } from '@/providers/app-provider';
import type { StructuredItem } from '@/types/item-schema';
import { getUserFacingErrorMessage } from '@/types/user-feedback';

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
        setDraft((next?.draftStructuredJson ?? next?.extractionResult?.structuredJson ?? null) as StructuredItem | null);
      });

      return () => {
        active = false;
      };
    }, [attemptId, runtime]),
  );

  const editableFields = useMemo(() => Object.entries(draft ?? {}), [draft]);

  if (!attempt || !draft) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted">Attempt not found.</Text>
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
      Alert.alert('Submit failed', getUserFacingErrorMessage(error, 'Unable to submit this attempt.'));
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
      Alert.alert('Retry failed', getUserFacingErrorMessage(error, 'Unable to retry extraction for this image.'));
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
