import { useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { BarcodeCamera, type BarcodeCameraHandle } from '@/components/barcode-camera';
import { ImagePreview } from '@/components/image-preview';
import { ScanAnimation } from '@/components/scan-animation';
import { AppHeader, BrutalFrame, StatusPill } from '@/components/ui/app-chrome';
import { Button } from '@/components/ui/button';
import { ScreenView } from '@/components/ui/screen';
import { SUPPORTED_BARCODE_TYPES } from '@/constants/barcode';
import { ToastDurations } from '@/constants/runtime';
import { useAppRuntime } from '@/providers/app-provider';
import { useToast } from '@/providers/toast-provider';
import { getErrorMessage } from '@/types/app-error';
import { isAbortError } from '@/utils/abort';
import type { BarcodeHit } from '@/utils/merge-extraction-result';

type PipelineStage = 'idle' | 'running' | 'done' | 'failed';

export function CaptureScreen() {
  const runtime = useAppRuntime();
  const toast = useToast();
  const router = useRouter();
  const cameraRef = useRef<BarcodeCameraHandle | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingImageUri, setProcessingImageUri] = useState<string | null>(null);
  const [barcodeState, setBarcodeState] = useState<PipelineStage>('idle');
  const [extractionState, setExtractionState] = useState<PipelineStage>('idle');
  const [websearchState, setWebsearchState] = useState<PipelineStage>('idle');
  const [activeStageStartedAt, setActiveStageStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [liveBarcodes, setLiveBarcodes] = useState<BarcodeHit[]>([]);

  useEffect(() => {
    if (!isProcessing || !activeStageStartedAt) {
      setElapsedSec(0);
      return;
    }

    const update = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - activeStageStartedAt) / 1000)));
    };

    update();
    const timer = setInterval(update, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [activeStageStartedAt, isProcessing]);

  async function handleGalleryImport() {
    try {
      const uri = await runtime.importFromGallery();
      if (!uri) {
        return;
      }

      setProcessingImageUri(uri);
      await runProcessing({ source: 'gallery', inputUri: uri });
    } catch (error) {
      toast.show({ text: getErrorMessage(error, 'Unable to import image.'), tone: 'error', durationMs: ToastDurations.errorMs });
      Alert.alert('Import failed', getErrorMessage(error, 'Unable to import image.'));
    }
  }

  async function handleCapture() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        toast.show({ text: 'Camera permission is required.', tone: 'warning', durationMs: ToastDurations.warningMs });
        Alert.alert('Permission required', 'Camera access is required to capture images.');
        return;
      }
    }

    try {
      const picture = await cameraRef.current?.takePictureAsync({ quality: 1 });
      if (!picture?.uri) {
        return;
      }

      setProcessingImageUri(picture.uri);
      await runProcessing({ source: 'camera', inputUri: picture.uri, liveBarcodes });
    } catch (error) {
      toast.show({ text: getErrorMessage(error, 'Unable to capture image.'), tone: 'error', durationMs: ToastDurations.errorMs });
      Alert.alert('Capture failed', getErrorMessage(error, 'Unable to capture image.'));
    }
  }

  async function runProcessing({
    source,
    inputUri,
    liveBarcodes,
  }: {
    source: 'camera' | 'gallery';
    inputUri: string;
    liveBarcodes?: BarcodeHit[];
  }) {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsProcessing(true);
    resetPipelineState();

    await nextPaint();

    let completed = false;

    try {
      const { attemptId } = await runtime.processImage({
        source,
        inputUri,
        liveBarcodes,
        signal: controller.signal,
        onProgress(stage) {
          if (stage === 'barcode_started') {
            setBarcodeState('running');
            setActiveStageStartedAt(Date.now());
          }

          if (stage === 'barcode_done') {
            setBarcodeState('done');
          }

          if (stage === 'extraction_started') {
            setExtractionState('running');
            setActiveStageStartedAt(Date.now());
          }

          if (stage === 'extraction_done') {
            setExtractionState('done');
          }

          if (stage === 'websearch_started') {
            setWebsearchState('running');
            setActiveStageStartedAt(Date.now());
          }

          if (stage === 'websearch_done') {
            setWebsearchState('done');
          }
        },
      });

      setLiveBarcodes([]);
      completed = true;
      setProcessingImageUri(null);
      resetPipelineState();
      setIsProcessing(false);
      router.push({ pathname: '/confirm/[attemptId]', params: { attemptId } });
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        return;
      }

      console.error('[tolksyn] Capture processing failed:', error);
      setExtractionState('failed');
      const message = getErrorMessage(error, 'Unable to extract data from image.');
      toast.show({ text: `Extraction failed: ${message}`, tone: 'error', durationMs: ToastDurations.errorMs });
      Alert.alert('Extraction failed', getErrorMessage(error, 'Unable to extract data from image.'));
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (!completed) {
        setProcessingImageUri(null);
        resetPipelineState();
      }
      setIsProcessing(false);
    }
  }

  function handleCancelProcessing() {
    abortControllerRef.current?.abort();
    setProcessingImageUri(null);
    setIsProcessing(false);
    resetPipelineState();
  }

  function resetPipelineState() {
    setBarcodeState('idle');
    setExtractionState('idle');
    setWebsearchState('idle');
    setActiveStageStartedAt(null);
    setElapsedSec(0);
  }

  return (
    <ScreenView className="gap-4 bg-background pb-6">
      <AppHeader
        eyebrow="Tolksyn"
        title="Capture"
        meta="Frame the label. Capture once. Review before sending."
        action={<Button variant="secondary" size="sm" label="Settings" onPress={() => router.push('/settings')} />}
      />

      <View className="relative flex-1 overflow-hidden border-4 border-border bg-black">
        {processingImageUri ? (
          <>
            <ImagePreview uri={processingImageUri} accessibilityLabel="Image being processed" className="h-full w-full bg-imageBase" contentFit="cover" />
            {isProcessing ? <ScanAnimation /> : null}
          </>
        ) : permission?.granted ? (
            <BarcodeCamera
              ref={cameraRef}
              style={styles.camera}
              accessibilityLabel="Live camera preview for product label capture"
              facing="back"
            barcodeTypes={SUPPORTED_BARCODE_TYPES}
            onBarcodeScanned={(event) => {
              setLiveBarcodes((current) => {
                const exists = current.some(
                  (barcode) => barcode.data === event.data && barcode.type === event.type,
                );
                if (exists) {
                  return current;
                }

                return [...current, { type: event.type, data: event.data }];
              });
            }}
          />
        ) : (
          <View className="flex-1 items-center justify-center gap-3 px-6">
            <Text className="text-center text-base font-semibold text-paper">
              Camera access is required for live capture.
            </Text>
            <Button
              label="Grant Camera Access"
              onPress={() => requestPermission()}
            />
          </View>
        )}
        {!processingImageUri ? (
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <View className="h-36 w-36 border-2 border-caution opacity-70" />
            <View className="absolute h-2 w-2 bg-caution" />
          </View>
        ) : null}
      </View>

      <BrutalFrame className="gap-3 bg-paper">
        <View className="flex-row flex-wrap gap-2">
          <StatusPill label={permission?.granted ? 'Camera Ready' : 'Camera Locked'} tone={permission?.granted ? 'success' : 'warning'} />
          <StatusPill label={liveBarcodes.length ? `${liveBarcodes.length} Barcode${liveBarcodes.length === 1 ? '' : 's'}` : 'No Barcode Yet'} tone={liveBarcodes.length ? 'warning' : 'default'} />
          <StatusPill label={`Barcode: ${formatStage(barcodeState, barcodeState === 'running' ? elapsedSec : undefined)}`} tone={stageTone(barcodeState)} />
          <StatusPill label={`Vision-language: ${formatStage(extractionState, extractionState === 'running' ? elapsedSec : undefined)}`} tone={stageTone(extractionState)} />
          <StatusPill label={`Websearch: ${formatStage(websearchState, websearchState === 'running' ? elapsedSec : undefined)}`} tone={stageTone(websearchState)} />
          {isProcessing ? <StatusPill label="Processing" tone="warning" /> : null}
        </View>
        <View className="flex-row gap-2">
          {isProcessing ? (
            <Button
              variant="secondary"
              className="flex-1"
              label="Cancel"
              onPress={handleCancelProcessing}
            />
          ) : (
            <Button
              variant="secondary"
              className="flex-1"
              label="Gallery"
              onPress={handleGalleryImport}
            />
          )}
          <Button
            variant="primary"
            className="flex-[1.4]"
            disabled={isProcessing}
            label={isProcessing ? 'Processing…' : 'Capture'}
            onPress={handleCapture}
          />
        </View>
      </BrutalFrame>
    </ScreenView>
  );
}

function formatStage(stage: PipelineStage, elapsedSec?: number) {
  if (stage === 'running') {
    return elapsedSec == null ? 'running' : `running (${elapsedSec}s)`;
  }

  if (stage === 'done') {
    return 'done';
  }

  if (stage === 'failed') {
    return 'failed';
  }

  return 'waiting';
}

function stageTone(stage: PipelineStage): 'default' | 'warning' | 'success' | 'danger' {
  if (stage === 'failed') {
    return 'danger';
  }

  if (stage === 'done') {
    return 'success';
  }

  if (stage === 'running') {
    return 'warning';
  }

  return 'default';
}

const styles = StyleSheet.create({
  camera: {
    flex: 1,
  },
});

function nextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}
