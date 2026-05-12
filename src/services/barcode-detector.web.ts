import type { BarcodeHit } from '@/utils/merge-extraction-result';

type WebBarcodeDetector = {
  detect(source: ImageBitmapSource): Promise<{ format: string; rawValue: string }[]>;
};

type WebBarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): WebBarcodeDetector;
  getSupportedFormats?: () => Promise<readonly string[]>;
};

const BARCODE_IMAGE_TIMEOUT_MS = 10_000;
const MAX_BARCODE_IMAGE_SIZE = 5 * 1024 * 1024;

const expoToWebBarcodeType: Record<string, string> = {
  aztec: 'aztec',
  codabar: 'codabar',
  code39: 'code_39',
  code93: 'code_93',
  code128: 'code_128',
  datamatrix: 'data_matrix',
  ean8: 'ean_8',
  ean13: 'ean_13',
  itf14: 'itf',
  pdf417: 'pdf417',
  qr: 'qr_code',
  upc_a: 'upc_a',
  upc_e: 'upc_e',
};

const webToExpoBarcodeType = new Map(
  Object.entries(expoToWebBarcodeType).map(([expoType, webType]) => [webType, expoType]),
);

export function createBarcodeDetector() {
  return {
    async detect({ imageUri, allowedTypes }: { imageUri: string; allowedTypes?: string[] }): Promise<BarcodeHit[]> {
      return detectWebBarcodes(imageUri, allowedTypes);
    },
  };
}

async function detectWebBarcodes(imageUri: string, allowedTypes?: string[]): Promise<BarcodeHit[]> {
  const BarcodeDetector = await resolveBarcodeDetector();
  if (typeof BarcodeDetector !== 'function' || typeof Image !== 'function') {
    return [];
  }

  let formats = allowedTypes?.map((type) => expoToWebBarcodeType[type] ?? type).filter(Boolean);
  if (!formats?.length) {
    formats = Object.values(expoToWebBarcodeType);
  }

  const supportedFormats = await BarcodeDetector.getSupportedFormats?.().catch(() => undefined);
  if (supportedFormats?.length) {
    const supported = new Set(supportedFormats);
    formats = formats.filter((format) => supported.has(format));
    if (!formats.length) {
      return [];
    }
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), BARCODE_IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(imageUri, { signal: controller.signal });
    if (!response.ok) {
      return [];
    }

    const contentLength = response.headers.get('Content-Length');
    if (contentLength && Number(contentLength) > MAX_BARCODE_IMAGE_SIZE) {
      return [];
    }

    const contentType = response.headers.get('Content-Type') ?? '';
    if (contentType && !contentType.toLowerCase().startsWith('image/')) {
      return [];
    }

    const blob = await response.blob();
    if (blob.size > MAX_BARCODE_IMAGE_SIZE) {
      return [];
    }

    const { source, cleanup } = await loadImageSource(blob);
    try {
      const detector = new BarcodeDetector({ formats });
      const results = await detector.detect(source);
      return results.map((result) => ({
        type: webToExpoBarcodeType.get(result.format) ?? result.format,
        data: result.rawValue,
      }));
    } finally {
      cleanup();
    }
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function resolveBarcodeDetector(): Promise<WebBarcodeDetectorConstructor | undefined> {
  const NativeBarcodeDetector = (globalThis as unknown as { BarcodeDetector?: WebBarcodeDetectorConstructor }).BarcodeDetector;
  if (typeof NativeBarcodeDetector === 'function') {
    return NativeBarcodeDetector;
  }

  try {
    const { BarcodeDetector } = await import('barcode-detector');
    return BarcodeDetector as unknown as WebBarcodeDetectorConstructor;
  } catch {
    return undefined;
  }
}

async function loadImageSource(blob: Blob): Promise<{ source: HTMLImageElement; cleanup(): void }> {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.src = objectUrl;

  try {
    if (typeof image.decode === 'function') {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Unable to load barcode image.'));
      });
    }

    return {
      source: image,
      cleanup() {
        URL.revokeObjectURL(objectUrl);
      },
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}
