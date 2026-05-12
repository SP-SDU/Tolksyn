import type { BarcodeType } from 'expo-camera';
import { Camera } from 'expo-camera';
import { Platform } from 'react-native';

import type { BarcodeHit } from '@/utils/merge-extraction-result';

type WebBarcodeDetector = {
  detect(source: ImageBitmapSource): Promise<{ format: string; rawValue: string }[]>;
};

type WebBarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): WebBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

const expoToWebBarcodeType: Record<string, string> = {
  ean13: 'ean_13',
  ean8: 'ean_8',
  upc_a: 'upc_a',
  upc_e: 'upc_e',
  code128: 'code_128',
  code39: 'code_39',
  qr: 'qr_code',
  pdf417: 'pdf417',
};

const webToExpoBarcodeType = new Map(
  Object.entries(expoToWebBarcodeType).map(([expoType, webType]) => [webType, expoType]),
);

export function createBarcodeDetector() {
  return {
    async detect({ imageUri, allowedTypes }: { imageUri: string; allowedTypes?: string[] }): Promise<BarcodeHit[]> {
      if (Platform.OS === 'web') {
        return detectWebBarcodes(imageUri, allowedTypes);
      }

      try {
        const results = await Camera.scanFromURLAsync(imageUri, allowedTypes as BarcodeType[] | undefined);
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

async function detectWebBarcodes(imageUri: string, allowedTypes?: string[]): Promise<BarcodeHit[]> {
  const BarcodeDetector = (globalThis as { BarcodeDetector?: WebBarcodeDetectorConstructor }).BarcodeDetector;
  if (typeof BarcodeDetector !== 'function' || typeof createImageBitmap !== 'function') {
    return [];
  }

  let formats = allowedTypes?.map((type) => expoToWebBarcodeType[type] ?? type).filter(Boolean);
  if (!formats?.length) {
    formats = Object.values(expoToWebBarcodeType);
  }

  try {
    const supportedFormats = await BarcodeDetector.getSupportedFormats?.();
    if (supportedFormats?.length) {
      const supported = new Set(supportedFormats);
      formats = formats.filter((format) => supported.has(format));
      if (!formats.length) {
        return [];
      }
    }

    const response = await fetch(imageUri);
    const bitmap = await createImageBitmap(await response.blob());

    try {
      const detector = new BarcodeDetector({ formats });
      const results = await detector.detect(bitmap);
      return results.map((result) => ({
        type: webToExpoBarcodeType.get(result.format) ?? result.format,
        data: result.rawValue,
      }));
    } finally {
      bitmap.close();
    }
  } catch {
    return [];
  }
}
