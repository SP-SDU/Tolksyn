import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { ScreenView } from '@/components/ui/screen';
import { useAppRuntime } from '@/providers/app-provider';
import { useToast } from '@/providers/toast-provider';
import { getErrorMessage } from '@/types/app-error';
import type { BarcodeHit } from '@/utils/merge-extraction-result';

export function CaptureScreen() {
  const runtime = useAppRuntime();
  const toast = useToast();
  const router = useRouter();
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [barcodeState, setBarcodeState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [extractionState, setExtractionState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [websearchState, setWebsearchState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [liveBarcodes, setLiveBarcodes] = useState<BarcodeHit[]>([]);

  async function handleGalleryImport() {
    try {
      const uri = await runtime.importFromGallery();
      if (!uri) {
        return;
      }

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
    const progressId = 'capture-pipeline';
    setIsProcessing(true);
    setBarcodeState('idle');
    setExtractionState('idle');
    setWebsearchState('idle');

    let barcode: 'idle' | 'running' | 'done' | 'failed' = 'idle';
    let extraction: 'idle' | 'running' | 'done' | 'failed' = 'idle';
    let websearch: 'idle' | 'running' | 'done' | 'failed' = 'idle';
    const startedAt = Date.now();

    const formatProgressText = () => {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      const elapsed = extraction === 'running' || websearch === 'running' ? ` (${elapsedSec}s)` : '';
      return `Barcode: ${formatStage(barcode)}\nVision-language: ${formatStage(extraction)}\nWebsearch: ${formatStage(websearch)}${elapsed}`;
    };

    toast.progress({
      id: progressId,
      text: formatProgressText(),
      tone: 'info',
    });

    const timer = setInterval(() => {
      if (extraction === 'running') {
        toast.progress({
          id: progressId,
          text: formatProgressText(),
          tone: 'info',
        });
      }
    }, 1000);

    try {
      const { attemptId } = await runtime.processImage({
        source,
        inputUri,
        liveBarcodes,
        onProgress(stage) {
          if (stage === 'barcode_started') {
            barcode = 'running';
            setBarcodeState('running');
            toast.progress({
              id: progressId,
              text: formatProgressText(),
              tone: 'info',
            });
          }

          if (stage === 'barcode_done') {
            barcode = 'done';
            setBarcodeState('done');
            toast.progress({
              id: progressId,
              text: formatProgressText(),
              tone: 'info',
            });
          }

          if (stage === 'extraction_started') {
            extraction = 'running';
            setExtractionState('running');
            toast.progress({
              id: progressId,
              text: formatProgressText(),
              tone: 'info',
            });
          }

          if (stage === 'extraction_done') {
            extraction = 'done';
            setExtractionState('done');
            toast.progress({
              id: progressId,
              text: formatProgressText(),
              tone: 'info',
            });
          }

          if (stage === 'websearch_started') {
            websearch = 'running';
            setWebsearchState('running');
            toast.progress({
              id: progressId,
              text: formatProgressText(),
              tone: 'info',
            });
          }

          if (stage === 'websearch_done') {
            websearch = 'done';
            setWebsearchState('done');
            toast.progress({
              id: progressId,
              text: formatProgressText(),
              tone: 'info',
            });
          }
        },
      });

      setLiveBarcodes([]);
      toast.progressDone({ id: progressId, text: 'Extraction complete. Opening review.' });
      router.push({ pathname: '/confirm/[attemptId]', params: { attemptId } });
    } catch (error) {
      console.error('[tolksyn] Capture processing failed:', error);
      extraction = 'failed';
      setExtractionState('failed');
      const message = getErrorMessage(error, 'Unable to extract data from image.');
      toast.progressFail({ id: progressId, text: `Extraction failed: ${message}` });
      Alert.alert('Extraction failed', getErrorMessage(error, 'Unable to extract data from image.'));
    } finally {
      clearInterval(timer);
      setIsProcessing(false);
    }
  }

  return (
    <ScreenView className="gap-4 bg-background pb-7">
      <View className="flex-row justify-between">
        <Button
          variant="secondary"
          size="sm"
          className="rounded-xl px-4"
          textClassName="text-sm"
          label="Settings"
          onPress={() => router.push('/settings')}
        />
        <Button
          variant="secondary"
          size="sm"
          className="rounded-xl px-4"
          textClassName="text-sm"
          label="Gallery"
          onPress={handleGalleryImport}
        />
      </View>

      <View className="relative flex-1 overflow-hidden rounded-3xl bg-black">
        {permission?.granted ? (
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
            <Text className="text-center text-base text-slate-200">
              Camera access is required for live capture.
            </Text>
            <Button
              label="Grant Camera Access"
              onPress={() => requestPermission()}
              className="rounded-xl px-4"
            />
          </View>
        )}

        <Card className="absolute bottom-3 left-3 right-3 gap-1 bg-slate-900/85">
          <CardTitle className="text-base text-slate-100">Parallel extraction</CardTitle>
          <Text className="text-sm text-slate-300">Barcode: {formatStage(barcodeState)}</Text>
          <Text className="text-sm text-slate-300">Vision-language: {formatStage(extractionState)}</Text>
          <Text className="text-sm text-slate-300">Websearch: {formatStage(websearchState)}</Text>
          <Text className="text-sm text-slate-300">Live hits: {liveBarcodes.length}</Text>
        </Card>
      </View>

      <View className="items-center">
        <Button
          disabled={isProcessing}
          label={isProcessing ? 'Processing…' : 'Capture'}
          className="h-14 min-w-48 rounded-full"
          textClassName="text-lg"
          onPress={handleCapture}
        />
      </View>
    </ScreenView>
  );
}

function formatStage(stage: 'idle' | 'running' | 'done' | 'failed') {
  if (stage === 'running') {
    return 'running';
  }

  if (stage === 'done') {
    return 'done';
  }

  if (stage === 'failed') {
    return 'failed';
  }

  return 'waiting';
}

const styles = StyleSheet.create({
  camera: {
    flex: 1,
  },
});
