import type { BarcodeType } from "expo-camera";
import { Camera } from "expo-camera";

import type { BarcodeHit } from "@/utils/merge-extraction-result";

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
