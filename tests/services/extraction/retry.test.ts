import { extractWithRetries } from "@/services/extraction/retry";
import { AppError } from "@/types/app-error";
import { emptyStructuredItem } from "@/types/item-schema";

describe("extractWithRetries", () => {
  test("retries parse errors and returns success diagnostics on later success", async () => {
    const extract = jest
      .fn()
      .mockRejectedValueOnce(
        new AppError(
          "schema_violation",
          "Provider JSON failed schema validation.",
        ),
      )
      .mockResolvedValueOnce({
        structuredJson: {
          ...emptyStructuredItem(),
          manufacturer: "Siemens",
        },
        barcodes: [],
        responseText: '{"structured_json":{"manufacturer":"Siemens"}}',
        metadata: {
          provider: "remote_openai_compatible",
          durationMs: 1234,
          imageWidth: 100,
          imageHeight: 100,
        },
      });

    const result = await extractWithRetries({
      fallbackProvider: "remote_openai_compatible",
      input: remoteInput(),
      extract,
    });

    expect(extract).toHaveBeenCalledTimes(2);
    expect(result.extractionDiagnostics?.failed).toBe(false);
    expect(result.extractionDiagnostics?.attempts).toEqual([
      {
        attempt: 1,
        prompt: expect.stringContaining("Extract product label data"),
        error: "Provider JSON failed schema validation.",
      },
      {
        attempt: 2,
        prompt: expect.stringContaining("RETRY ATTEMPT 2."),
        responseText: '{"structured_json":{"manufacturer":"Siemens"}}',
      },
    ]);
  });

  test("falls back to empty structured item after retry exhaustion", async () => {
    const extract = jest
      .fn()
      .mockRejectedValue(new AppError("schema_violation", "bad json"));

    const result = await extractWithRetries({
      fallbackProvider: "remote_gemini",
      input: remoteInput(),
      extract,
    });

    expect(extract).toHaveBeenCalledTimes(3);
    expect(result.metadata.provider).toBe("remote_gemini");
    expect(result.extractionDiagnostics?.failed).toBe(true);
    expect(result.structuredJson).toEqual(emptyStructuredItem());
    expect(result.barcodes).toEqual([]);
    expect(result.extractionDiagnostics?.finalError).toBe("bad json");
    expect(result.extractionDiagnostics?.fallbackStructuredJson).toBe(true);
    expect(result.extractionDiagnostics?.attempts).toHaveLength(3);
  });

  test("uses caller provided prompt for the first attempt and repair prompt base", async () => {
    const extract = jest
      .fn()
      .mockRejectedValueOnce(new AppError("schema_violation", "bad json"))
      .mockResolvedValueOnce({
        structuredJson: emptyStructuredItem(),
        barcodes: [],
        metadata: {
          provider: "remote_openai_compatible",
          durationMs: 1,
          imageWidth: 100,
          imageHeight: 100,
        },
      });

    await extractWithRetries({
      fallbackProvider: "remote_openai_compatible",
      input: {
        ...remoteInput(),
        prompt: "Return query JSON only.",
      },
      extract,
    });

    expect(extract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        prompt: "Return query JSON only.",
      }),
    );
    expect(extract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        prompt: expect.stringContaining("Return query JSON only."),
      }),
    );
  });

  test("includes structured field error details in repair prompt", async () => {
    const extract = jest
      .fn()
      .mockRejectedValueOnce(
        new AppError(
          "schema_violation",
          "Provider JSON failed schema validation.",
          {
            fieldErrors: {
              quantity: ["Expected a number"],
              link: ["Expected a valid URL"],
            },
          },
        ),
      )
      .mockResolvedValueOnce({
        structuredJson: emptyStructuredItem(),
        barcodes: [],
        metadata: {
          provider: "remote_openai_compatible",
          durationMs: 1,
          imageWidth: 100,
          imageHeight: 100,
        },
      });

    await extractWithRetries({
      fallbackProvider: "remote_openai_compatible",
      input: {
        ...remoteInput(),
        prompt: "Return strict JSON.",
      },
      extract,
    });

    expect(extract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        prompt: expect.stringContaining("quantity: Expected a number"),
      }),
    );
    expect(extract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        prompt: expect.stringContaining("link: Expected a valid URL"),
      }),
    );
  });

  test.each(["invalid_response", "internal", "extraction_fallback"] as const)(
    "retries %s provider errors",
    async (code) => {
      const extract = jest
        .fn()
        .mockRejectedValueOnce(new AppError(code, code))
        .mockResolvedValueOnce({
          structuredJson: emptyStructuredItem(),
          barcodes: [],
          metadata: {
            provider: "remote_openai_compatible",
            durationMs: 1,
            imageWidth: 100,
            imageHeight: 100,
          },
        });

      const result = await extractWithRetries({
        fallbackProvider: "remote_openai_compatible",
        input: remoteInput(),
        extract,
      });

      expect(extract).toHaveBeenCalledTimes(2);
      expect(result.extractionDiagnostics?.failed).toBe(false);
    },
  );

  test("treats raw provider errors as retryable internal errors", async () => {
    const extract = jest
      .fn()
      .mockRejectedValueOnce(new Error("raw failure"))
      .mockResolvedValueOnce({
        structuredJson: emptyStructuredItem(),
        barcodes: [],
        metadata: {
          provider: "remote_openai_compatible",
          durationMs: 1,
          imageWidth: 100,
          imageHeight: 100,
        },
      });

    const result = await extractWithRetries({
      fallbackProvider: "remote_openai_compatible",
      input: remoteInput(),
      extract,
    });

    expect(extract).toHaveBeenCalledTimes(2);
    expect(result.extractionDiagnostics?.failed).toBe(false);
  });

  test("does not retry non-retryable provider errors", async () => {
    const extract = jest
      .fn()
      .mockRejectedValue(new AppError("auth_failed", "bad credentials"));

    const result = await extractWithRetries({
      fallbackProvider: "remote_openai_compatible",
      input: remoteInput(),
      extract,
    });

    expect(extract).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      structuredJson: emptyStructuredItem(),
      barcodes: [],
      metadata: {
        provider: "remote_openai_compatible",
        durationMs: 1,
        imageWidth: 100,
        imageHeight: 100,
      },
      extractionDiagnostics: {
        failed: true,
        finalError: "bad credentials",
        fallbackStructuredJson: true,
        attempts: [
          {
            attempt: 1,
            prompt: expect.stringContaining("Extract product label data"),
            error: "bad credentials",
          },
        ],
      },
    });
  });

  test("uses zero fallback image dimensions when input has no images", async () => {
    const extract = jest
      .fn()
      .mockRejectedValue(new AppError("auth_failed", "bad credentials"));

    const result = await extractWithRetries({
      fallbackProvider: "remote_openai_compatible",
      input: { ...remoteInput(), images: [] },
      extract,
    });

    expect(result.metadata.imageWidth).toBe(0);
    expect(result.metadata.imageHeight).toBe(0);
  });

  test("throws before extraction when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const extract = jest.fn();

    await expect(
      extractWithRetries({
        fallbackProvider: "remote_openai_compatible",
        input: { ...remoteInput(), signal: controller.signal },
        extract,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(extract).not.toHaveBeenCalled();
  });

  test("preserves AbortError thrown by provider", async () => {
    const abortError = new Error("Provider aborted");
    abortError.name = "AbortError";
    const extract = jest.fn().mockRejectedValue(abortError);

    await expect(
      extractWithRetries({
        fallbackProvider: "remote_openai_compatible",
        input: remoteInput(),
        extract,
      }),
    ).rejects.toBe(abortError);
    expect(extract).toHaveBeenCalledTimes(1);
  });

  test("throws after extraction when signal aborts during provider work", async () => {
    const controller = new AbortController();
    const extract = jest.fn().mockImplementation(async () => {
      controller.abort();
      return {
        structuredJson: emptyStructuredItem(),
        barcodes: [],
        metadata: {
          provider: "remote_openai_compatible",
          durationMs: 1,
          imageWidth: 100,
          imageHeight: 100,
        },
      };
    });

    await expect(
      extractWithRetries({
        fallbackProvider: "remote_openai_compatible",
        input: { ...remoteInput(), signal: controller.signal },
        extract,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(extract).toHaveBeenCalledTimes(1);
  });

  test("throws abort instead of fallback when final provider attempt aborts", async () => {
    const controller = new AbortController();
    const extract = jest.fn().mockImplementation(async () => {
      if (extract.mock.calls.length === 3) {
        controller.abort();
      }

      throw new AppError("schema_violation", "late provider error");
    });

    await expect(
      extractWithRetries({
        fallbackProvider: "remote_openai_compatible",
        input: { ...remoteInput(), signal: controller.signal },
        extract,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(extract).toHaveBeenCalledTimes(3);
  });

  test("omits validation details when field errors are empty or malformed", async () => {
    const extract = jest
      .fn()
      .mockRejectedValueOnce(
        new AppError("schema_violation", "bad json", {
          fieldErrors: {
            quantity: [],
            link: "not-array",
          },
        }),
      )
      .mockResolvedValueOnce({
        structuredJson: emptyStructuredItem(),
        barcodes: [],
        metadata: {
          provider: "remote_openai_compatible",
          durationMs: 1,
          imageWidth: 100,
          imageHeight: 100,
        },
      });

    await extractWithRetries({
      fallbackProvider: "remote_openai_compatible",
      input: { ...remoteInput(), prompt: "Base prompt." },
      extract,
    });

    const repairPrompt = extract.mock.calls[1][0].prompt;
    expect(repairPrompt).toBe(
      "Base prompt. RETRY ATTEMPT 2. Previous error: bad json Fix your previous output and return one single valid JSON object only. No markdown, no prose, no code fences, no partial fragments.",
    );
    expect(repairPrompt).not.toContain("Validation details:");
  });

  test("formats multiple validation messages and fields in repair prompt", async () => {
    const extract = jest
      .fn()
      .mockRejectedValueOnce(
        new AppError("schema_violation", "bad json", {
          fieldErrors: {
            quantity: ["Expected a number", "Must be positive"],
            priceEur: ["Expected a number"],
          },
        }),
      )
      .mockResolvedValueOnce({
        structuredJson: emptyStructuredItem(),
        barcodes: [],
        metadata: {
          provider: "remote_openai_compatible",
          durationMs: 1,
          imageWidth: 100,
          imageHeight: 100,
        },
      });

    await extractWithRetries({
      fallbackProvider: "remote_openai_compatible",
      input: remoteInput(),
      extract,
    });

    const repairPrompt = extract.mock.calls[1][0].prompt;
    expect(repairPrompt).toBe(
      "Extract product label data to a strict JSON object. Return one single complete valid JSON object only. Do not stream partial fragments. Do not add markdown, code fences, comments, notes, or prose. Use top-level keys: structured_json and auxiliary_text_optional. structured_json must be an object with exactly these keys: sku, manufacturer, productNumber, productText, productVersion, eanOrUpc, countryOfOrigin, itemCategory, packaging, condition, externalCondition, workingCondition, quantity, batchSize, storagePosition, externalNote, internalNote, priceEur, status, advancedInformation, weightKg, heightMm, widthMm, lengthMm, hsCode, itemGroup, reference, sendingType, sellingType, link If a value is unknown, use null. Use number for numeric fields and string for text fields. Preserve literal barcode-like strings in text fields like eanOrUpc without formatting changes. All keys must be present exactly once. Never omit keys. JSON must be parseable by JSON.parse without edits. RETRY ATTEMPT 2. Previous error: bad json Validation details: quantity: Expected a number, Must be positive; priceEur: Expected a number Fix your previous output and return one single valid JSON object only. No markdown, no prose, no code fences, no partial fragments.",
    );
    expect(repairPrompt).toContain(
      "quantity: Expected a number, Must be positive; priceEur: Expected a number",
    );
  });

  test.each([undefined, null, [], { fieldErrors: null }, { fieldErrors: [] }])(
    "omits validation details for invalid cause %#",
    async (cause) => {
      const extract = jest
        .fn()
        .mockRejectedValueOnce(
          new AppError("schema_violation", "bad json", cause),
        )
        .mockResolvedValueOnce({
          structuredJson: emptyStructuredItem(),
          barcodes: [],
          metadata: {
            provider: "remote_openai_compatible",
            durationMs: 1,
            imageWidth: 100,
            imageHeight: 100,
          },
        });

      await extractWithRetries({
        fallbackProvider: "remote_openai_compatible",
        input: remoteInput(),
        extract,
      });

      expect(extract.mock.calls[1][0].prompt).not.toContain(
        "Validation details:",
      );
    },
  );

  test("omits validation details from raw errors even when cause has field errors", async () => {
    const rawError = new Error("raw failure") as Error & { cause?: unknown };
    rawError.cause = { fieldErrors: { quantity: ["Expected a number"] } };
    const extract = jest
      .fn()
      .mockRejectedValueOnce(rawError)
      .mockResolvedValueOnce({
        structuredJson: emptyStructuredItem(),
        barcodes: [],
        metadata: {
          provider: "remote_openai_compatible",
          durationMs: 1,
          imageWidth: 100,
          imageHeight: 100,
        },
      });

    await extractWithRetries({
      fallbackProvider: "remote_openai_compatible",
      input: remoteInput(),
      extract,
    });

    expect(extract.mock.calls[1][0].prompt).not.toContain(
      "Validation details:",
    );
  });

  test("omits validation details from array-shaped causes", async () => {
    const cause = [] as unknown[] & {
      fieldErrors?: Record<string, string[]>;
    };
    cause.fieldErrors = { quantity: ["Expected a number"] };
    const extract = jest
      .fn()
      .mockRejectedValueOnce(
        new AppError("schema_violation", "bad json", cause),
      )
      .mockResolvedValueOnce({
        structuredJson: emptyStructuredItem(),
        barcodes: [],
        metadata: {
          provider: "remote_openai_compatible",
          durationMs: 1,
          imageWidth: 100,
          imageHeight: 100,
        },
      });

    await extractWithRetries({
      fallbackProvider: "remote_openai_compatible",
      input: remoteInput(),
      extract,
    });

    expect(extract.mock.calls[1][0].prompt).not.toContain(
      "Validation details:",
    );
  });

  test("omits validation details from array fieldErrors", async () => {
    const extract = jest
      .fn()
      .mockRejectedValueOnce(
        new AppError("schema_violation", "bad json", {
          fieldErrors: [["Expected a number"]],
        }),
      )
      .mockResolvedValueOnce({
        structuredJson: emptyStructuredItem(),
        barcodes: [],
        metadata: {
          provider: "remote_openai_compatible",
          durationMs: 1,
          imageWidth: 100,
          imageHeight: 100,
        },
      });

    await extractWithRetries({
      fallbackProvider: "remote_openai_compatible",
      input: remoteInput(),
      extract,
    });

    expect(extract.mock.calls[1][0].prompt).not.toContain(
      "Validation details:",
    );
  });

  test("omits validation details from function fieldErrors", async () => {
    const fieldErrors = (() => undefined) as (() => undefined) & {
      quantity?: string[];
    };
    fieldErrors.quantity = ["Expected a number"];
    const extract = jest
      .fn()
      .mockRejectedValueOnce(
        new AppError("schema_violation", "bad json", { fieldErrors }),
      )
      .mockResolvedValueOnce({
        structuredJson: emptyStructuredItem(),
        barcodes: [],
        metadata: {
          provider: "remote_openai_compatible",
          durationMs: 1,
          imageWidth: 100,
          imageHeight: 100,
        },
      });

    await extractWithRetries({
      fallbackProvider: "remote_openai_compatible",
      input: remoteInput(),
      extract,
    });

    expect(extract.mock.calls[1][0].prompt).not.toContain(
      "Validation details:",
    );
  });

  test("preserves abort semantics when cancellation wins a provider error race", async () => {
    const controller = new AbortController();
    const extract = jest.fn().mockImplementation(async () => {
      controller.abort();
      throw new AppError("schema_violation", "late provider error");
    });

    await expect(
      extractWithRetries({
        fallbackProvider: "remote_openai_compatible",
        input: { ...remoteInput(), signal: controller.signal },
        extract,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(extract).toHaveBeenCalledTimes(1);
  });
});

function remoteInput() {
  return {
    apiKey: "k",
    model: "m",
    images: [
      {
        imageBase64: "abc",
        mimeType: "image/jpeg",
        width: 100,
        height: 100,
      },
    ],
    timeoutMs: 5000,
  };
}
