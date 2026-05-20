export const RuntimeLimits = {
  maxWebResponseBytes: 5 * 1024 * 1024,
  webFetchTimeoutMs: 30_000,
  maxWebFetchTimeoutMs: 120_000,
  exaSearchTimeoutMs: 25_000,
  ingestTimeoutMs: 30_000,
  barcodeImageTimeoutMs: 10_000,
  maxBarcodeImageBytes: 5 * 1024 * 1024,
  maxExtractionAttempts: 3,
  historyLimit: 20,
  normalizedImageWidth: 1200,
  thumbnailImageWidth: 240,
} as const;

export const ToastDurations = {
  messageMs: 2200,
  successMs: 2500,
  warningMs: 2800,
  errorMs: 3200,
  failureMs: 3500,
} as const;
