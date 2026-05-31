import { CameraView } from "expo-camera";
import { forwardRef } from "react";

import type {
  BarcodeCameraHandle,
  BarcodeCameraProps,
} from "@/components/barcode-camera";

export const BarcodeCamera = forwardRef<
  BarcodeCameraHandle,
  BarcodeCameraProps
>(function BarcodeCamera(
  {
    barcodeTypes: _barcodeTypes,
    onBarcodeScanned: _onBarcodeScanned,
    ...props
  },
  ref,
) {
  return <CameraView ref={ref} {...props} />;
});
