import { useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BarcodeCamera, type BarcodeCameraHandle } from '@/components/barcode-camera';
import { ImagePreview } from '@/components/image-preview';
import { ScanAnimation } from '@/components/scan-animation';
import { AppHeader, BrutalFrame, StatusPill } from '@/components/ui/app-chrome';
import { Button } from '@/components/ui/button';
import { ScreenView } from '@/components/ui/screen';
import { SUPPORTED_BARCODE_TYPES } from '@/constants/barcode';
import { ToastDurations } from '@/constants/runtime';
import { usePendingImages } from '@/hooks/use-pending-images';
import { useAppRuntime } from '@/providers/app-provider';
import { useToast } from '@/providers/toast-provider';
import { getErrorMessage } from '@/types/app-error';
import { isAbortError } from '@/utils/abort';
import type { BarcodeHit } from '@/utils/merge-extraction-result';

type PipelineStage = 'idle' | 'running' | 'done' | 'failed';

function isSameCapturedImage(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a === b;
}

export function CaptureScreen() {
  const runtime = useAppRuntime();
  const toast = useToast();
  const router = useRouter();
  const cameraRef = useRef<BarcodeCameraHandle | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingImageUris, setProcessingImageUris] = useState<string[] | null>(null);
  const {
    pendingImages,
    addCameraImage,
    addGalleryImages,
    removePendingImage,
    clearPendingImages,
    restorePendingImages,
    getLastCameraImage,
    getProcessingInput,
  } = usePendingImages();
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
      const uris = await runtime.importFromGallery();
      if (!uris || uris.length === 0) {
        return;
      }

      addGalleryImages(uris);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to import image.');
      toast.show({ text: message, tone: 'error', durationMs: ToastDurations.errorMs });
      Alert.alert('Import failed', message);
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

      const capturedUri =
        Platform.OS === 'web' && !picture.uri.startsWith('data:')
          ? `${picture.uri}${picture.uri.includes('?') ? '&' : '?'}captureId=${Date.now()}-${Math.random().toString(36).slice(2)}`
          : picture.uri;

      const lastCameraImage = getLastCameraImage();

      if (isSameCapturedImage(lastCameraImage?.uri, capturedUri)) {
        toast.show({
          text: 'The camera returned the same image. Move the camera or wait a moment, then try again.',
          tone: 'warning',
          durationMs: ToastDurations.errorMs,
        });
        return;
      }

      addCameraImage(capturedUri);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to capture image.');
      toast.show({ text: message, tone: 'error', durationMs: ToastDurations.errorMs });
      Alert.alert('Capture failed', message);
    }
  }

  async function runProcessing({
    source,
    inputUris,
    liveBarcodes,
  }: {
    source: 'camera' | 'gallery';
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
      setProcessingImageUris(null);
      resetPipelineState();
      setIsProcessing(false);
      router.push({ pathname: '/confirm/[attemptId]', params: { attemptId } });
      return true;
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        return false;
      }

      console.error('[tolksyn] Capture processing failed:', error);
      setExtractionState('failed');

      const message = getErrorMessage(error, 'Unable to extract data from image.');
      toast.show({ text: `Extraction failed: ${message}`, tone: 'error', durationMs: ToastDurations.errorMs });
      Alert.alert('Extraction failed', message);
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

  async function handleProcessPending() {
    const imagesToProcess = pendingImages;
    if (imagesToProcess.length === 0) return;

    const { inputUris, source } = getProcessingInput();

    setProcessingImageUris(inputUris);
    clearPendingImages();

    const succeeded = await runProcessing({ source, inputUris, liveBarcodes });
    if (!succeeded) {
      restorePendingImages(imagesToProcess);
    }
  }

  function handleCancelProcessing() {
    abortControllerRef.current?.abort();
    setProcessingImageUris(null);
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
        {processingImageUris?.length ? (
          <>
            <View className="absolute inset-0">
              <ImagePreview
                uri={processingImageUris[0]}
                accessibilityLabel="Image being processed"
                className="h-full w-full bg-imageBase"
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
              />
            </View>
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

        {!processingImageUris?.length && pendingImages.length === 0 ? (
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <View className="h-36 w-36 border-2 border-caution opacity-70" />
            <View className="absolute h-2 w-2 bg-caution" />
          </View>
        ) : null}
      </View>

      {pendingImages.length > 0 ? (
        <BrutalFrame className="gap-2 bg-paper">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-xs font-black uppercase tracking-wide text-muted">
              Captured images
            </Text>
            <StatusPill label={`${pendingImages.length} ready`} tone="success" />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="w-full"
            contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingBottom: 2 }}
          >
            {pendingImages.map((image) => (
              <View
                key={image.id}
                className="relative h-20 w-20 shrink-0 overflow-hidden border-2 border-border bg-imageBase"
              >
                <ImagePreview
                  uri={image.uri}
                  accessibilityLabel="Pending image"
                  className="h-20 w-20"
                  style={styles.thumbnailImage}
                  contentFit="cover"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove image"
                  onPress={() => removePendingImage(image.id)}
                  className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full border-2 border-border bg-paper"
                >
                  <Text className="text-xs font-black leading-4 text-foreground">×</Text>
                </Pressable>
              </View>
            ))}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add images from gallery"
              onPress={handleGalleryImport}
              className="h-20 w-20 shrink-0 items-center justify-center border-2 border-dashed border-border bg-background"
            >
              <Text className="text-3xl font-black leading-8 text-foreground">+</Text>
              <Text className="text-[10px] font-black uppercase leading-3 text-muted">Gallery</Text>
            </Pressable>
          </ScrollView>
        </BrutalFrame>
      ) : null}

      <BrutalFrame className="gap-3 bg-paper">
        <View className="flex-row flex-wrap gap-2">
          <StatusPill label={permission?.granted ? 'Camera Ready' : 'Camera Locked'} tone={permission?.granted ? 'success' : 'warning'} />
          <StatusPill label={liveBarcodes.length ? `${liveBarcodes.length} Barcode${liveBarcodes.length === 1 ? '' : 's'}` : 'No Barcode Yet'} tone={liveBarcodes.length ? 'warning' : 'default'} />
          <StatusPill label={`Barcode: ${formatStage(barcodeState, barcodeState === 'running' ? elapsedSec : undefined)}`} tone={stageTone(barcodeState)} />
          <StatusPill label={`Vision-language: ${formatStage(extractionState, extractionState === 'running' ? elapsedSec : undefined)}`} tone={stageTone(extractionState)} />
          <StatusPill label={`Websearch: ${formatStage(websearchState, websearchState === 'running' ? elapsedSec : undefined)}`} tone={stageTone(websearchState)} />
          {isProcessing ? <StatusPill label="Processing" tone="warning" /> : null}
        </View>

        {isProcessing ? (
          <View className="flex-row gap-2">
            <Button
              variant="secondary"
              className="flex-1 min-h-12 px-3 py-3"
              textClassName="text-center text-xs leading-5"
              label="Cancel"
              onPress={handleCancelProcessing}
            />
          </View>
        ) : pendingImages.length > 0 ? (
          <View className="flex-row gap-2">
            <Button
              variant="primary"
              className="flex-1 min-h-12 px-3 py-3"
              textClassName="text-center text-xs leading-5"
              label={`Process (${pendingImages.length})`}
              onPress={handleProcessPending}
            />
            <Button
              variant="secondary"
              className="flex-1 min-h-12 px-3 py-3"
              textClassName="text-center text-xs leading-5"
              label="Capture"
              onPress={handleCapture}
            />
          </View>
        ) : (
          <View className="flex-row gap-2">
            <Button
              variant="secondary"
              className="flex-1 min-h-12 px-3 py-3"
              textClassName="text-center text-xs leading-5"
              label="Gallery"
              onPress={handleGalleryImport}
            />
            <Button
              variant="primary"
              className="flex-1 min-h-12 px-3 py-3"
              textClassName="text-center text-xs leading-5"
              disabled={isProcessing}
              label={isProcessing ? 'Processing…' : 'Capture'}
              onPress={handleCapture}
            />
          </View>
        )}
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
  thumbnailImage: {
    width: 80,
    height: 80,
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