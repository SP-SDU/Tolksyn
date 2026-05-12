import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { AppHeader, BrutalFrame, StatusPill } from '@/components/ui/app-chrome';
import { Button } from '@/components/ui/button';
import { ScreenView } from '@/components/ui/screen';
import { AppDesign } from '@/constants/design';
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
  const cameraRef = useRef<CameraView | null>(null);
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
      toast.show({ text: getErrorMessage(error, 'Unable to import image.'), tone: 'error', durationMs: 3200 });
      Alert.alert('Import failed', getErrorMessage(error, 'Unable to import image.'));
    }
  }

  async function handleCapture() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        toast.show({ text: 'Camera permission is required.', tone: 'warning', durationMs: 2800 });
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
      toast.show({ text: getErrorMessage(error, 'Unable to capture image.'), tone: 'error', durationMs: 3200 });
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
      toast.show({ text: `Extraction failed: ${message}`, tone: 'error', durationMs: 3200 });
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
            <Image source={processingImageUri} className="h-full w-full bg-imageBase" contentFit="cover" />
            {isProcessing ? <ScanFinderOverlay /> : null}
          </>
        ) : permission?.granted ? (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr', 'pdf417'],
            }}
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

function ScanFinderOverlay() {
  const progress = useRef(new Animated.Value(0)).current;
  const finder = (
    <View
      style={{
        width: 92,
        height: 92,
        borderWidth: 3,
        borderColor: AppDesign.color.yellow,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: 8, height: 8, backgroundColor: AppDesign.color.yellow }} />
    </View>
  );

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 760, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(progress, { toValue: 2, duration: 820, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(progress, { toValue: 3, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(progress, { toValue: 4, duration: 880, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 760, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1, 2, 3, 4],
    outputRange: [-86, 58, -12, 92, -62],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1, 2, 3, 4],
    outputRange: [-108, -44, 70, 12, 112],
  });

  if (Platform.OS === 'web') {
    const webAnimationStyle = {
      animation: 'scan-finder 3.9s ease-in-out infinite',
      willChange: 'transform',
    } as unknown as ViewStyle;

    return (
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center bg-black/15">
        <View style={webAnimationStyle}>{finder}</View>
      </View>
    );
  }

  return (
    <View pointerEvents="none" className="absolute inset-0 items-center justify-center bg-black/15">
      <Animated.View style={{ transform: [{ translateX }, { translateY }] }}>
        {finder}
      </Animated.View>
    </View>
  );
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
