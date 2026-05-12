import { forwardRef } from 'react';
import { CameraView, type BarcodeScanningResult, type BarcodeType } from 'expo-camera';
import type { StyleProp, ViewStyle } from 'react-native';

export type BarcodeCameraHandle = CameraView;

export type BarcodeCameraProps = {
  style?: StyleProp<ViewStyle>;
  facing: 'front' | 'back';
  barcodeTypes: BarcodeType[];
  onBarcodeScanned(event: Pick<BarcodeScanningResult, 'data' | 'type'>): void;
};

export const BarcodeCamera = forwardRef<BarcodeCameraHandle, BarcodeCameraProps>(function BarcodeCamera(
  { barcodeTypes, onBarcodeScanned, ...props },
  ref,
) {
  return (
    <CameraView
      ref={ref}
      {...props}
      barcodeScannerSettings={{ barcodeTypes }}
      onBarcodeScanned={onBarcodeScanned}
    />
  );
});
