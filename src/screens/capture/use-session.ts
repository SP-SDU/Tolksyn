import { useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";

import type { BarcodeCameraHandle } from "@/components/barcode-camera";
import { ToastDurations } from "@/constants/runtime";
import { usePendingImages } from "@/hooks/use-pending-images";
import { useAppRuntime } from "@/providers/app-provider";
import { useToast } from "@/providers/toast-provider";
import { getErrorMessage } from "@/types/app-error";
import type { BarcodeHit } from "@/types/extraction";
import { isAbortError } from "@/utils/abort";

type Stage = "idle" | "running" | "done" | "failed";

type CaptureProgressStage =
  | "persisted"
  | "barcode_started"
  | "barcode_done"
  | "extraction_started"
  | "extraction_done"
  | "websearch_started"
  | "websearch_done";

function isSameCapturedImage(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a === b;
}

function bustWebCaptureCache(uri: string) {
  if (Platform.OS !== "web" || uri.startsWith("data:")) {
    return uri;
  }

  const separator = uri.includes("?") ? "&" : "?";
  return `${uri}${separator}captureId=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

export function useSession() {
  const runtime = useAppRuntime();
  const toast = useToast();
  const router = useRouter();
  const cameraRef = useRef<BarcodeCameraHandle | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingImageUris, setProcessingImageUris] = useState<
    string[] | null
  >(null);
  const [barcodeState, setBarcodeState] = useState<Stage>("idle");
  const [extractionState, setExtractionState] = useState<Stage>("idle");
  const [websearchState, setWebsearchState] = useState<Stage>("idle");
  const [activeStageStartedAt, setActiveStageStartedAt] = useState<
    number | null
  >(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [liveBarcodes, setLiveBarcodes] = useState<BarcodeHit[]>([]);
  const pending = usePendingImages();

  useEffect(() => {
    if (!isProcessing || !activeStageStartedAt) {
      setElapsedSec(0);
      return;
    }

    const update = () => {
      setElapsedSec(
        Math.max(0, Math.floor((Date.now() - activeStageStartedAt) / 1000)),
      );
    };

    update();
    const timer = setInterval(update, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [activeStageStartedAt, isProcessing]);

  function resetPipelineState() {
    setBarcodeState("idle");
    setExtractionState("idle");
    setWebsearchState("idle");
    setActiveStageStartedAt(null);
    setElapsedSec(0);
  }

  async function handleGalleryImport() {
    try {
      const uris = await runtime.importFromGallery();
      if (uris?.length) {
        pending.addGalleryImages(uris);
      }
    } catch (error) {
      const message = getErrorMessage(error, "Unable to import image.");
      toast.show({
        text: message,
        tone: "error",
        durationMs: ToastDurations.errorMs,
      });
      Alert.alert("Import failed", message);
    }
  }

  async function handleCapture() {
    if (!(await ensureCameraPermission())) {
      return;
    }

    try {
      const picture = await cameraRef.current?.takePictureAsync({ quality: 1 });
      if (!picture?.uri) {
        return;
      }

      const capturedUri = bustWebCaptureCache(picture.uri);
      const lastCameraImage = pending.getLastCameraImage();
      if (isSameCapturedImage(lastCameraImage?.uri, capturedUri)) {
        toast.show({
          text: "The camera returned the same image. Move the camera or wait a moment, then try again.",
          tone: "warning",
          durationMs: ToastDurations.errorMs,
        });
        return;
      }

      pending.addCameraImage(capturedUri);
    } catch (error) {
      const message = getErrorMessage(error, "Unable to capture image.");
      toast.show({
        text: message,
        tone: "error",
        durationMs: ToastDurations.errorMs,
      });
      Alert.alert("Capture failed", message);
    }
  }

  async function ensureCameraPermission() {
    if (permission?.granted) {
      return true;
    }

    const result = await requestPermission();
    if (result.granted) {
      return true;
    }

    toast.show({
      text: "Camera permission is required.",
      tone: "warning",
      durationMs: ToastDurations.warningMs,
    });
    Alert.alert(
      "Permission required",
      "Camera access is required to capture images.",
    );
    return false;
  }

  async function runProcessing({
    source,
    inputUris,
    liveBarcodes,
  }: {
    source: "camera" | "gallery";
    inputUris: string[];
    liveBarcodes?: BarcodeHit[];
  }): Promise<boolean> {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsProcessing(true);
    resetPipelineState();
    await nextPaint();

    let completed = false;
    try {
      const { attemptId } = await runtime.processImages({
        source,
        inputUris,
        liveBarcodes,
        signal: controller.signal,
        onProgress: handleProgress,
      });

      setLiveBarcodes([]);
      completed = true;
      setProcessingImageUris(null);
      resetPipelineState();
      setIsProcessing(false);
      router.push({ pathname: "/confirm/[attemptId]", params: { attemptId } });
      return true;
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        return false;
      }

      console.error("[tolksyn] Capture processing failed:", error);
      setExtractionState("failed");
      const message = getErrorMessage(
        error,
        "Unable to extract data from image.",
      );
      toast.show({
        text: `Extraction failed: ${message}`,
        tone: "error",
        durationMs: ToastDurations.errorMs,
      });
      Alert.alert("Extraction failed", message);
      return false;
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }

      if (!completed) {
        setProcessingImageUris(null);
        resetPipelineState();
      }

      setIsProcessing(false);
    }
  }

  function handleProgress(stage: CaptureProgressStage) {
    const now = Date.now();

    if (stage === "barcode_started") {
      setBarcodeState("running");
      setActiveStageStartedAt(now);
    } else if (stage === "barcode_done") {
      setBarcodeState("done");
    } else if (stage === "extraction_started") {
      setExtractionState("running");
      setActiveStageStartedAt(now);
    } else if (stage === "extraction_done") {
      setExtractionState("done");
    } else if (stage === "websearch_started") {
      setWebsearchState("running");
      setActiveStageStartedAt(now);
    } else if (stage === "websearch_done") {
      setWebsearchState("done");
    }
  }

  async function handleProcessPending() {
    const imagesToProcess = pending.pendingImages;
    if (imagesToProcess.length === 0) return;

    const { inputUris, source } = pending.getProcessingInput();
    setProcessingImageUris(inputUris);
    pending.clearPendingImages();

    const succeeded = await runProcessing({ source, inputUris, liveBarcodes });
    if (!succeeded) {
      pending.restorePendingImages(imagesToProcess);
    }
  }

  function handleCancelProcessing() {
    abortControllerRef.current?.abort();
    setProcessingImageUris(null);
    setIsProcessing(false);
    resetPipelineState();
  }

  function handleBarcodeScanned(barcode: BarcodeHit) {
    setLiveBarcodes((current) => {
      const exists = current.some(
        (item) => item.data === barcode.data && item.type === barcode.type,
      );
      return exists ? current : [...current, barcode];
    });
  }

  return {
    cameraRef,
    permission,
    requestPermission,
    isProcessing,
    processingImageUris,
    pendingImages: pending.pendingImages,
    liveBarcodes,
    barcodeState,
    extractionState,
    websearchState,
    elapsedSec,
    handleGalleryImport,
    handleCapture,
    handleProcessPending,
    handleCancelProcessing,
    handleBarcodeScanned,
    removePendingImage: pending.removePendingImage,
  };
}

export type Session = ReturnType<typeof useSession>;
