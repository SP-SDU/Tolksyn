import { StyleSheet, Text, View } from "react-native";

import { BarcodeCamera } from "@/components/barcode-camera";
import { ImagePreview } from "@/components/image-preview";
import { ScanAnimation } from "@/components/scan-animation";
import { Button } from "@/components/ui/button";
import { SUPPORTED_BARCODE_TYPES } from "@/constants/barcode";

import type { Session } from "./use-session";

export function CameraPanel({ session }: { session: Session }) {
  return (
    <View className="relative flex-1 overflow-hidden border-4 border-border bg-black">
      <CameraContent session={session} />
      {!session.processingImageUris?.length && !session.pendingImages.length ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
        >
          <View className="h-36 w-36 border-2 border-caution opacity-70" />
          <View className="absolute h-2 w-2 bg-caution" />
        </View>
      ) : null}
    </View>
  );
}

function CameraContent({ session }: { session: Session }) {
  if (session.processingImageUris?.length) {
    return (
      <>
        <View className="absolute inset-0">
          <ImagePreview
            uri={session.processingImageUris[0]}
            accessibilityLabel="Image being processed"
            className="h-full w-full bg-imageBase"
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
          />
        </View>
        {session.isProcessing ? <ScanAnimation /> : null}
      </>
    );
  }

  if (session.permission?.granted) {
    return (
      <BarcodeCamera
        ref={session.cameraRef}
        style={styles.camera}
        accessibilityLabel="Live camera preview for product label capture"
        facing="back"
        barcodeTypes={SUPPORTED_BARCODE_TYPES}
        onBarcodeScanned={(event) =>
          session.handleBarcodeScanned({ type: event.type, data: event.data })
        }
      />
    );
  }

  return (
    <View className="flex-1 items-center justify-center gap-3 px-6">
      <Text className="text-center text-base font-semibold text-paper">
        Camera access is required for live capture.
      </Text>
      <Button label="Grant Camera Access" onPress={session.requestPermission} />
    </View>
  );
}

const styles = StyleSheet.create({
  camera: {
    flex: 1,
  },
});
