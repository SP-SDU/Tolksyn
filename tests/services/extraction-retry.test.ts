import { extractWithRetries } from "@/services/extraction-retry";
import { AppError } from "@/types/app-error";
import { emptyStructuredItem } from "@/types/item-schema";

describe("extractWithRetries", () => {
  test("retries parse errors and returns success diagnostics on later success", async () => {
    // Arrange
    // First call fails with schema_violation. Second succeeds
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

    // Act
    const result = await extractWithRetries({
      fallbackProvider: "remote_openai_compatible",
      input: {
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
      },
      extract,
    });

    // Assert
    // One retry occurred. Final attempt succeeded
    expect(extract).toHaveBeenCalledTimes(2);
    expect(result.extractionDiagnostics?.failed).toBe(false);
    expect(result.extractionDiagnostics?.attempts).toHaveLength(2);
  });

  test("falls back to empty structured item after retry exhaustion", async () => {
    // Arrange
    // All calls fail. Retries exhausted
    const extract = jest
      .fn()
      .mockRejectedValue(new AppError("schema_violation", "bad json"));

    // Act
    const result = await extractWithRetries({
      fallbackProvider: "remote_gemini",
      input: {
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
      },
      extract,
    });

    // Assert
    // Exhausted 3 retries. Returns empty item with failed=true
    expect(extract).toHaveBeenCalledTimes(3);
    expect(result.metadata.provider).toBe("remote_gemini");
    expect(result.extractionDiagnostics?.failed).toBe(true);
    expect(result.structuredJson).toEqual(emptyStructuredItem());
    expect(result.extractionDiagnostics?.attempts).toHaveLength(3);
  });

  test("uses caller provided prompt for the first attempt and repair prompt base", async () => {
    // Arrange
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

    // Act
    await extractWithRetries({
      fallbackProvider: "remote_openai_compatible",
      input: {
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
        prompt: "Return query JSON only.",
      },
      extract,
    });

    // Assert
    // Original prompt used on first call. Repair prompt includes original context
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

  test("preserves abort semantics when cancellation wins a provider error race", async () => {
    // Arrange
    const controller = new AbortController();
    const extract = jest.fn().mockImplementation(async () => {
      // Provider error arrives after cancellation was already requested
      controller.abort();
      throw new AppError("schema_violation", "late provider error");
    });

    // Act and Assert
    // Cancellation should take priority over the provider error
    await expect(
      extractWithRetries({
        fallbackProvider: "remote_openai_compatible",
        input: {
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
          signal: controller.signal,
        },
        extract,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    // No retry after cancellation
    expect(extract).toHaveBeenCalledTimes(1);
  });
});
