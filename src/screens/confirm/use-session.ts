import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";

import {
  CONFIRM_AUTOCOMPLETE_FIELDS,
  CONFIRM_ENUM_OPTIONS,
} from "@/constants/confirmation-options";
import { useAppRuntime } from "@/providers/app-provider";
import { applyConfirmDefaults } from "@/services/confirmation-defaults";
import { getErrorMessage } from "@/types/app-error";
import type { StructuredItem } from "@/types/item-schema";
import { emptyStructuredItem } from "@/types/item-schema";

type Runtime = ReturnType<typeof useAppRuntime>;
export type ConfirmAttempt = NonNullable<
  Awaited<ReturnType<Runtime["attempts"]["getById"]>>
>;

const numericFields = new Set([
  "quantity",
  "batchSize",
  "priceEur",
  "weightKg",
  "heightMm",
  "widthMm",
  "lengthMm",
]);

export function useSession(attemptId: string) {
  const runtime = useAppRuntime();
  const router = useRouter();
  const [attempt, setAttempt] = useState<ConfirmAttempt | null>(null);
  const [draft, setDraft] = useState<StructuredItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isAcceptPickerOpen, setIsAcceptPickerOpen] = useState(false);
  const [activePickerField, setActivePickerField] = useState<string | null>(
    null,
  );
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<
    Record<string, string[]>
  >({});

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void loadAttempt(runtime, attemptId).then((next) => {
        if (!active) return;
        setAttempt(next.attempt);
        setDraft(next.draft);
      });

      void loadAutocomplete(runtime).then((suggestions) => {
        if (active) {
          setAutocompleteSuggestions(suggestions);
        }
      });

      return () => {
        active = false;
      };
    }, [attemptId, runtime]),
  );

  const editableFields = useMemo(() => Object.entries(draft ?? {}), [draft]);

  function updateDraftField(key: string, nextValue: string) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        [key]: numericFields.has(key)
          ? nextValue.length === 0
            ? null
            : Number(nextValue)
          : nextValue,
      } as StructuredItem;
    });
  }

  function selectDraftValue(key: string, value: string) {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, [key]: value } as StructuredItem;
    });
  }

  async function performAcceptAction(actionId: string) {
    if (!attempt || !draft) return;

    setIsSubmitting(true);
    try {
      await runtime.attempts.saveDraft(attempt.id, draft);
      const payload = createAcceptPayload(attempt, draft);

      if (actionId === "export_json") {
        await runtime.exportService.exportJson(payload);
        router.replace("/");
      } else if (actionId === "export_csv") {
        await runtime.exportService.exportCsv(attempt.id, draft);
        router.replace("/");
      } else if (actionId === "upload") {
        const result = await runtime.submitAttempt({
          attemptId: attempt.id,
          acceptedRevision: attempt.acceptedRevision + 1,
          payload,
        });
        Alert.alert(
          result.outcome === "sent" ? "Sent" : "Queued",
          `Idempotency key: ${result.idempotencyKey}`,
        );
        router.replace("/");
      }
    } catch (error) {
      Alert.alert(
        "Action failed",
        getErrorMessage(error, "Unable to complete the selected action."),
      );
    } finally {
      setIsSubmitting(false);
      setIsAcceptPickerOpen(false);
    }
  }

  async function handleTryAgain() {
    if (!attempt) return;

    const retryImageUris = attempt.images.map((image) => image.imageUri);
    if (retryImageUris.length === 0) {
      Alert.alert("Retry failed", "This attempt has no images to retry.");
      return;
    }

    setIsRetrying(true);
    try {
      const result = await runtime.processImages({
        source: attempt.source,
        inputUris: retryImageUris,
      });
      router.replace({
        pathname: "/confirm/[attemptId]",
        params: { attemptId: result.attemptId },
      });
    } catch (error) {
      Alert.alert(
        "Retry failed",
        getErrorMessage(error, "Unable to retry extraction for this image."),
      );
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleDiscard() {
    if (!attempt) return;

    setIsDiscarding(true);
    try {
      await runtime.attempts.deleteById(attempt.id);
      router.replace("/");
    } catch (error) {
      Alert.alert(
        "Discard failed",
        getErrorMessage(error, "Unable to discard this attempt."),
      );
    } finally {
      setIsDiscarding(false);
    }
  }

  return {
    attempt,
    draft,
    editableFields,
    autocompleteSuggestions,
    activePickerField,
    isAcceptPickerOpen,
    isSubmitting,
    isRetrying,
    isDiscarding,
    setActivePickerField,
    setIsAcceptPickerOpen,
    updateDraftField,
    selectDraftValue,
    performAcceptAction,
    handleTryAgain,
    handleDiscard,
  };
}

async function loadAttempt(runtime: Runtime, attemptId: string) {
  const attempt = (await runtime.attempts.getById(
    attemptId,
  )) as ConfirmAttempt | null;
  const fallbackDraft = attempt?.extractionDiagnostics?.failed
    ? emptyStructuredItem()
    : null;
  const initialDraft = (attempt?.draftStructuredJson ??
    attempt?.extractionResult?.structuredJson ??
    fallbackDraft) as StructuredItem | null;

  return {
    attempt,
    draft: initialDraft ? applyConfirmDefaults(initialDraft) : null,
  };
}

async function loadAutocomplete(runtime: Runtime) {
  const results = await Promise.all(
    CONFIRM_AUTOCOMPLETE_FIELDS.map(async (field) => ({
      field,
      distinct: await runtime.attempts.getDistinctFieldValues(
        field as keyof StructuredItem,
        20,
      ),
    })),
  );

  return Object.fromEntries(
    results.map((result) => [result.field, result.distinct]),
  );
}

function createAcceptPayload(attempt: ConfirmAttempt, draft: StructuredItem) {
  return {
    schemaVersion: "tolksyn.item.v1" as const,
    attemptId: attempt.id,
    acceptedRevision: attempt.acceptedRevision + 1,
    structuredJson: draft,
    barcodeEnrichment: attempt.extractionResult?.barcodeEnrichment ?? {
      detected: [],
      primary: null,
      relatedFieldSuggestions: { eanOrUpc: null },
      conflicts: [],
    },
    auxiliaryText: attempt.extractionResult?.auxiliaryText,
    metadata: {
      source: attempt.source,
      provider: attempt.extractionResult?.metadata.provider,
    },
  };
}

export { CONFIRM_ENUM_OPTIONS };

export type Session = ReturnType<typeof useSession>;
