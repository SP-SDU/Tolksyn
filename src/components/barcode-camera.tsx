import {
  CameraView,
  type BarcodeScanningResult,
  type BarcodeType,
} from "expo-camera";
import { forwardRef } from "react";
import type { AccessibilityProps, StyleProp, ViewStyle } from "react-native";

export type BarcodeCameraHandle = CameraView;

/** Live scan during preview can populate eanOrUpc before slower post-capture detection. */
export type BarcodeCameraProps = AccessibilityProps & {
  style?: StyleProp<ViewStyle>;
  facing: "front" | "back";
  barcodeTypes: BarcodeType[];
  onBarcodeScanned(event: Pick<BarcodeScanningResult, "data" | "type">): void;
};

export const BarcodeCamera = forwardRef<
  BarcodeCameraHandle,
  BarcodeCameraProps
>(function BarcodeCamera({ barcodeTypes, onBarcodeScanned, ...props }, ref) {
  return (
    <CameraView
      ref={ref}
      {...props}
      barcodeScannerSettings={{ barcodeTypes }}
      onBarcodeScanned={onBarcodeScanned}
    />
  );
});
