import { processImage } from "@/services/capture-processing";
import { emptyStructuredItem } from "@/types/item-schema";

describe("processImage", () => {
  test("creates an attempt and saves merged extraction output", async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const saveExtractionResult = jest.fn().mockResolvedValue(undefined);

    const result = await processImage({
      source: "camera",
      inputUris: ["file://input.jpg"],
      liveBarcodes: [{ type: "ean13", data: "4046356160483" }],
      now: () => 123,
      createAttemptId: () => "attempt-123",
      imageStore: {
        persistImages: jest.fn().mockResolvedValue([
          {
            imageUri: "file://stored.jpg",
            thumbnailUri: "file://thumb.jpg",
            imageBase64: "abc",
            mimeType: "image/jpeg",
            width: 1200,
            height: 900,
          },
        ]),
      },
      attempts: {
        create,
        saveExtractionResult,
      },
      barcodeDetector: {
        detect: jest
          .fn()
          .mockResolvedValue([{ type: "ean13", data: "4046356160483" }]),
      },
      extractor: {
        extract: jest.fn().mockResolvedValue({
          structuredJson: {
            ...emptyStructuredItem(),
            manufacturer: "Siemens",
          },
          barcodes: [],
          metadata: {
            provider: "remote_openai_compatible",
            durationMs: 1400,
            imageWidth: 1200,
            imageHeight: 900,
          },
        }),
      },
    });

    // Full pipeline: persist images, detect barcodes, extract, merge, save
    expect(result).toEqual({ attemptId: "attempt-123" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "attempt-123",
        source: "camera",
        images: [
          { imageUri: "file://stored.jpg", thumbnailUri: "file://thumb.jpg" },
        ],
      }),
    );
    // Extraction result includes both AI-extracted data and barcode enrichment
    expect(saveExtractionResult).toHaveBeenCalledWith(
      "attempt-123",
      expect.objectContaining({
        structuredJson: expect.objectContaining({ manufacturer: "Siemens" }),
        barcodeEnrichment: expect.objectContaining({
          detected: [{ type: "ean13", data: "4046356160483" }],
        }),
      }),
    );
  });

  test("runs manufacturer web search enrichment after extraction and saves reconciled output", async () => {
    const saveExtractionResult = jest.fn().mockResolvedValue(undefined);
    const stages: string[] = [];

    await processImage({
      source: "camera",
      inputUris: ["file://input.jpg"],
      now: () => 123,
      createAttemptId: () => "attempt-websearch",
      imageStore: {
        persistImages: jest.fn().mockResolvedValue([
          {
            imageUri: "file://stored.jpg",
            thumbnailUri: "file://thumb.jpg",
            imageBase64: "abc",
            mimeType: "image/jpeg",
            width: 1200,
            height: 900,
          },
        ]),
      },
      attempts: {
        create: jest.fn().mockResolvedValue(undefined),
        saveExtractionResult,
      },
      barcodeDetector: {
        detect: jest
          .fn()
          .mockResolvedValue([{ type: "ean13", data: "4046356160483" }]),
      },
      extractor: {
        extract: jest.fn().mockResolvedValue({
          structuredJson: {
            ...emptyStructuredItem(),
            productNumber: "2865463",
          },
          barcodes: [],
          auxiliaryText: "label text",
          metadata: {
            provider: "remote_openai_compatible",
            durationMs: 1400,
            imageWidth: 1200,
            imageHeight: 900,
          },
        }),
      },
      webSearchEnricher: {
        enrich: jest.fn().mockResolvedValue({
          structuredJson: {
            ...emptyStructuredItem(),
            manufacturer: "Phoenix Contact",
            productNumber: "2865463",
          },
          diagnostics: {
            enabled: true,
            attempts: [],
            queries: ["Phoenix Contact 2865463 official datasheet"],
            searchResults: [
              {
                query: "Phoenix Contact 2865463 official datasheet",
                output: "official product result",
                urls: ["https://example.com/product"],
              },
            ],
            sources: [
              {
                url: "https://example.com/product",
                excerpt: "official product page",
              },
            ],
            fieldChanges: [
              {
                field: "manufacturer",
                before: null,
                after: "Phoenix Contact",
                evidenceUrls: ["https://example.com/product"],
              },
            ],
            conflicts: [],
            failed: false,
            durationMs: 25,
          },
        }),
      },
      onProgress: (stage) => stages.push(stage),
    });

    // Web search progress stages emitted during pipeline execution
    expect(stages).toEqual(
      expect.arrayContaining(["websearch_started", "websearch_done"]),
    );

    // Final save includes web search enrichment with manufacturer and evidence
    expect(saveExtractionResult).toHaveBeenCalledWith(
      "attempt-websearch",
      expect.objectContaining({
        structuredJson: expect.objectContaining({
          manufacturer: "Phoenix Contact",
          productNumber: "2865463",
        }),
        webSearchEnrichment: expect.objectContaining({
          queries: ["Phoenix Contact 2865463 official datasheet"],
          fieldChanges: [
            expect.objectContaining({
              field: "manufacturer",
              after: "Phoenix Contact",
            }),
          ],
          sources: [
            expect.objectContaining({ url: "https://example.com/product" }),
          ],
        }),
      }),
    );
  });

  test("keeps extraction result when manufacturer web search enrichment fails", async () => {
    // Web search enricher throws but extraction should still be saved
    const saveExtractionResult = jest.fn().mockResolvedValue(undefined);

    await processImage({
      source: "camera",
      inputUris: ["file://input.jpg"],
      now: () => 123,
      createAttemptId: () => "attempt-websearch-failed",
      imageStore: {
        persistImages: jest.fn().mockResolvedValue([
          {
            imageUri: "file://stored.jpg",
            thumbnailUri: "file://thumb.jpg",
            imageBase64: "abc",
            mimeType: "image/jpeg",
            width: 1200,
            height: 900,
          },
        ]),
      },
      attempts: {
        create: jest.fn().mockResolvedValue(undefined),
        saveExtractionResult,
      },
      barcodeDetector: {
        detect: jest.fn().mockResolvedValue([]),
      },
      extractor: {
        extract: jest.fn().mockResolvedValue({
          structuredJson: {
            ...emptyStructuredItem(),
            productNumber: "2865463",
          },
          barcodes: [],
          metadata: {
            provider: "remote_openai_compatible",
            durationMs: 1400,
            imageWidth: 1200,
            imageHeight: 900,
          },
        }),
      },
      webSearchEnricher: {
        enrich: jest.fn().mockRejectedValue(new Error("Exa unavailable")),
      },
    });

    // Extraction result saved even when web search fails
    expect(saveExtractionResult).toHaveBeenCalledWith(
      "attempt-websearch-failed",
      expect.objectContaining({
        structuredJson: expect.objectContaining({
          productNumber: "2865463",
        }),
        webSearchEnrichment: expect.objectContaining({
          enabled: true,
          failed: true,
          error: "Exa unavailable",
        }),
      }),
    );
  });

  test("marks attempt as extract_failed when extraction diagnostics report fallback", async () => {
    // Extraction succeeded but reported failed diagnostics (retries exhausted)
    const create = jest.fn().mockResolvedValue(undefined);
    const saveExtractionResult = jest.fn().mockResolvedValue(undefined);
    const markFailed = jest.fn().mockResolvedValue(undefined);

    await processImage({
      source: "gallery",
      inputUris: ["file://input.jpg"],
      now: () => 123,
      createAttemptId: () => "attempt-xyz",
      imageStore: {
        persistImages: jest.fn().mockResolvedValue([
          {
            imageUri: "file://stored.jpg",
            thumbnailUri: "file://thumb.jpg",
            imageBase64: "abc",
            mimeType: "image/jpeg",
            width: 1200,
            height: 900,
          },
        ]),
      },
      attempts: {
        create,
        saveExtractionResult,
        markFailed,
      },
      barcodeDetector: {
        detect: jest.fn().mockResolvedValue([]),
      },
      extractor: {
        extract: jest.fn().mockResolvedValue({
          structuredJson: emptyStructuredItem(),
          barcodes: [],
          extractionDiagnostics: {
            failed: true,
            finalError: "Provider JSON failed schema validation.",
            attempts: [],
          },
          metadata: {
            provider: "remote_openai_codex",
            durationMs: 1000,
            imageWidth: 1200,
            imageHeight: 900,
          },
        }),
      },
    });

    // Attempt marked as failed with the diagnostic error message
    expect(markFailed).toHaveBeenCalledWith(
      "attempt-xyz",
      "Provider JSON failed schema validation.",
    );
  });

  test("saves failed extraction result instead of throwing raw extractor errors", async () => {
    // Extractor throws a SyntaxError (e.g. malformed JSON from provider)
    const saveExtractionResult = jest.fn().mockResolvedValue(undefined);
    const markFailed = jest.fn().mockResolvedValue(undefined);

    const result = await processImage({
      source: "camera",
      inputUris: ["file://input.jpg"],
      now: () => 123,
      createAttemptId: () => "attempt-json-error",
      imageStore: {
        persistImages: jest.fn().mockResolvedValue([
          {
            imageUri: "file://stored.jpg",
            thumbnailUri: "file://thumb.jpg",
            imageBase64: "abc",
            mimeType: "image/jpeg",
            width: 1200,
            height: 900,
          },
        ]),
      },
      attempts: {
        create: jest.fn().mockResolvedValue(undefined),
        saveExtractionResult,
        markFailed,
      },
      barcodeDetector: {
        detect: jest.fn().mockResolvedValue([]),
      },
      extractor: {
        extract: jest
          .fn()
          .mockRejectedValue(
            new SyntaxError("Unterminated string in JSON at position 28"),
          ),
      },
    });

    // Pipeline catches the error, saves a failed extraction result, marks attempt failed
    expect(result).toEqual({ attemptId: "attempt-json-error" });
    expect(saveExtractionResult).toHaveBeenCalledWith(
      "attempt-json-error",
      expect.objectContaining({
        structuredJson: emptyStructuredItem(),
        extractionDiagnostics: expect.objectContaining({
          failed: true,
          finalError: "Unterminated string in JSON at position 28",
        }),
      }),
    );
    expect(markFailed).toHaveBeenCalledWith(
      "attempt-json-error",
      "Unterminated string in JSON at position 28",
    );
  });

  test("stops before creating an attempt when cancelled during image persistence", async () => {
    const controller = new AbortController();
    const create = jest.fn().mockResolvedValue(undefined);
    const saveExtractionResult = jest.fn().mockResolvedValue(undefined);

    const promise = processImage({
      source: "camera",
      inputUris: ["file://input.jpg"],
      signal: controller.signal,
      now: () => 123,
      createAttemptId: () => "attempt-cancel-before-create",
      imageStore: {
        persistImages: jest.fn().mockImplementation(async () => {
          // Abort fires during the first async operation
          controller.abort();

          return [storedImage()];
        }),
      },
      attempts: {
        create,
        saveExtractionResult,
      },
      barcodeDetector: {
        detect: jest.fn().mockResolvedValue([]),
      },
      extractor: {
        extract: jest.fn().mockResolvedValue(remoteExtractorResult()),
      },
    });

    // AbortError thrown. No attempt was created
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(create).not.toHaveBeenCalled();
    expect(saveExtractionResult).not.toHaveBeenCalled();
  });

  test("deletes a partial attempt and skips saving output when cancelled after creation", async () => {
    const controller = new AbortController();
    const deleteById = jest.fn().mockResolvedValue(undefined);
    const saveExtractionResult = jest.fn().mockResolvedValue(undefined);

    const promise = processImage({
      source: "gallery",
      inputUris: ["file://input.jpg"],
      signal: controller.signal,
      now: () => 123,
      createAttemptId: () => "attempt-cancel-after-create",
      imageStore: {
        persistImages: jest.fn().mockResolvedValue([storedImage()]),
      },
      attempts: {
        create: jest.fn().mockResolvedValue(undefined),
        saveExtractionResult,
        deleteById,
      },
      barcodeDetector: {
        detect: jest.fn().mockImplementation(async () => {
          // Abort triggered during barcode detection, after attempt creation
          controller.abort();
          throw new DOMException("Aborted", "AbortError");
        }),
      },
      extractor: {
        extract: jest.fn().mockResolvedValue(remoteExtractorResult()),
      },
    });

    // AbortError thrown. Partial attempt cleaned up via deleteById
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(saveExtractionResult).not.toHaveBeenCalled();
    expect(deleteById).toHaveBeenCalledWith("attempt-cancel-after-create");
  });

  test("persists and extracts multiple images for one attempt", async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const saveExtractionResult = jest.fn().mockResolvedValue(undefined);
    const extract = jest.fn().mockResolvedValue({
      structuredJson: emptyStructuredItem(),
      barcodes: [],
      responseText: "{}",
      auxiliaryText: undefined,
      metadata: {
        provider: "remote_ai_sdk",
        durationMs: 1,
        imageWidth: 1200,
        imageHeight: 900,
      },
    });

    await processImage({
      source: "camera",
      inputUris: ["file://input-1.jpg", "file://input-2.jpg"],
      now: () => 123,
      createAttemptId: () => "attempt-multi",
      imageStore: {
        persistImages: jest.fn().mockResolvedValue([
          {
            imageUri: "file://stored-1.jpg",
            thumbnailUri: "file://thumb-1.jpg",
            imageBase64: "abc1",
            mimeType: "image/jpeg",
            width: 1200,
            height: 900,
          },
          {
            imageUri: "file://stored-2.jpg",
            thumbnailUri: "file://thumb-2.jpg",
            imageBase64: "abc2",
            mimeType: "image/jpeg",
            width: 800,
            height: 600,
          },
        ]),
      },
      attempts: {
        create,
        saveExtractionResult,
        markFailed: jest.fn().mockResolvedValue(undefined),
        deleteById: jest.fn().mockResolvedValue(undefined),
      },
      barcodeDetector: {
        detect: jest.fn().mockResolvedValue([]),
      },
      extractor: {
        extract,
      },
    });

    // Both images persisted and passed to extractor
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "attempt-multi",
        images: [
          {
            imageUri: "file://stored-1.jpg",
            thumbnailUri: "file://thumb-1.jpg",
          },
          {
            imageUri: "file://stored-2.jpg",
            thumbnailUri: "file://thumb-2.jpg",
          },
        ],
      }),
    );

    expect(extract).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [
          expect.objectContaining({
            imageUri: "file://stored-1.jpg",
            imageBase64: "abc1",
          }),
          expect.objectContaining({
            imageUri: "file://stored-2.jpg",
            imageBase64: "abc2",
          }),
        ],
      }),
    );

    expect(saveExtractionResult).toHaveBeenCalled();
  });
});

function storedImage() {
  return {
    imageUri: "file://stored.jpg",
    thumbnailUri: "file://thumb.jpg",
    imageBase64: "abc",
    mimeType: "image/jpeg",
    width: 1200,
    height: 900,
  };
}

function remoteExtractorResult() {
  return {
    structuredJson: emptyStructuredItem(),
    barcodes: [],
    metadata: {
      provider: "remote_openai_compatible",
      durationMs: 1000,
      imageWidth: 1200,
      imageHeight: 900,
    },
  };
}
