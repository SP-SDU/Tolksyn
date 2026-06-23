import {
  EXPO_TO_WEB_BARCODE_TYPE,
  WEB_TO_EXPO_BARCODE_TYPE,
} from "@/constants/barcode";
import { RuntimeLimits } from "@/constants/runtime";
import type { BarcodeHit } from "@/types/extraction";

type WebBarcodeDetector = {
  detect(
    source: ImageBitmapSource,
  ): Promise<{ format: string; rawValue: string }[]>;
};

type WebBarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): WebBarcodeDetector;
  getSupportedFormats?: () => Promise<readonly string[]>;
};

/** Missing BarcodeDetector should not block capture, and confirm can still accept manual EAN entry. */
export function createBarcodeDetector() {
  return {
    async detect({
      imageUri,
      allowedTypes,
    }: {
      imageUri: string;
      allowedTypes?: string[];
    }): Promise<BarcodeHit[]> {
      return detectWebBarcodes(imageUri, allowedTypes);
    },
  };
}

async function detectWebBarcodes(
  imageUri: string,
  allowedTypes?: string[],
): Promise<BarcodeHit[]> {
  const BarcodeDetector = await resolveBarcodeDetector();
  if (typeof BarcodeDetector !== "function" || typeof Image !== "function") {
    return [];
  }

  let formats = allowedTypes
    ?.map((type) => EXPO_TO_WEB_BARCODE_TYPE[type] ?? type)
    .filter(Boolean);
  if (!formats?.length) {
    formats = Object.values(EXPO_TO_WEB_BARCODE_TYPE);
  }

  const supportedFormats = await BarcodeDetector.getSupportedFormats?.().catch(
    () => undefined,
  );
  if (supportedFormats?.length) {
    const supported = new Set(supportedFormats);
    formats = formats.filter((format) => supported.has(format));
    if (!formats.length) {
      return [];
    }
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    RuntimeLimits.barcodeImageTimeoutMs,
  );

  try {
    const response = await fetch(imageUri, { signal: controller.signal });
    if (!response.ok) {
      return [];
    }

    const contentLength = response.headers.get("Content-Length");
    if (
      contentLength &&
      Number(contentLength) > RuntimeLimits.maxBarcodeImageBytes
    ) {
      return [];
    }

    const contentType = response.headers.get("Content-Type") ?? "";
    if (contentType && !contentType.toLowerCase().startsWith("image/")) {
      return [];
    }

    const blob = await response.blob();
    if (blob.size > RuntimeLimits.maxBarcodeImageBytes) {
      return [];
    }

    const { source, cleanup } = await loadImageSource(blob);
    try {
      const detector = new BarcodeDetector({ formats });
      const results = await detector.detect(source);
      return results.map((result) => ({
        type: WEB_TO_EXPO_BARCODE_TYPE.get(result.format) ?? result.format,
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

async function resolveBarcodeDetector(): Promise<
  WebBarcodeDetectorConstructor | undefined
> {
  const NativeBarcodeDetector = (
    globalThis as unknown as { BarcodeDetector?: WebBarcodeDetectorConstructor }
  ).BarcodeDetector;
  if (typeof NativeBarcodeDetector === "function") {
    return NativeBarcodeDetector;
  }

  try {
    const { BarcodeDetector } = await import("barcode-detector");
    return BarcodeDetector as unknown as WebBarcodeDetectorConstructor;
  } catch {
    return undefined;
  }
}

async function loadImageSource(
  blob: Blob,
): Promise<{ source: HTMLImageElement; cleanup(): void }> {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.src = objectUrl;

  try {
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(new Error("Unable to load barcode image."));
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
