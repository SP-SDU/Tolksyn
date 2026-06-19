import type { BarcodeType } from "expo-camera";
import { Camera } from "expo-camera";

import type { BarcodeHit } from "@/types/extraction";

/** Live preview misses barcodes outside the frame, and post-capture scan catches stragglers. */
export function createBarcodeDetector() {
  return {
    async detect({
      imageUri,
      allowedTypes,
    }: {
      imageUri: string;
      allowedTypes?: string[];
    }): Promise<BarcodeHit[]> {
      try {
        const results = await Camera.scanFromURLAsync(
          imageUri,
          allowedTypes as BarcodeType[] | undefined,
        );
        return results.map((result) => ({
          type: result.type,
          data: result.data,
        }));
      } catch {
        return [];
      }
    },
  };
}
