import {
  extractionTimeoutMs,
  normalizeRemoteError,
  parseProviderJsonEnvelope,
  providerErrorMessage,
} from "@/api/providers/remote-extraction-shared";
import { AppError } from "@/types/app-error";

describe("parseProviderJsonEnvelope", () => {
  test("accepts top-level alias keys and fuzzy structured field names", () => {
    const raw = JSON.stringify({
      structuredJson: {
        manufactuer: "Siemens",
        product_number: "3RW4027-2BB04",
        quantitty: "2",
        price_eur: "1,234.50",
      },
      auxiliaryTextOptional: { source: "operator" },
    });

    const parsed = parseProviderJsonEnvelope(raw);

    expect(parsed.structuredJson.manufacturer).toBe("Siemens");
    expect(parsed.structuredJson.productNumber).toBe("3RW4027-2BB04");
    expect(parsed.structuredJson.quantity).toBe(2);
    expect(parsed.structuredJson.priceEur).toBe(1234.5);
    expect(parsed.auxiliaryText).toBe('{"source":"operator"}');
  });

  test("accepts fenced JSON and stringified structured payload", () => {
    const raw = [
      "```json",
      JSON.stringify({
        structured_json: JSON.stringify({
          manufacturer: "Phoenix Contact",
          quantity: "7",
        }),
      }),
      "```",
    ].join("\n");

    const parsed = parseProviderJsonEnvelope(raw);

    expect(parsed.structuredJson.manufacturer).toBe("Phoenix Contact");
    expect(parsed.structuredJson.quantity).toBe(7);
  });

  test("returns undefined auxiliary text when provider omits it", () => {
    const parsed = parseProviderJsonEnvelope(
      JSON.stringify({ structured_json: { manufacturer: "Siemens" } }),
    );

    expect(parsed.structuredJson.manufacturer).toBe("Siemens");
    expect(parsed.auxiliaryText).toBeUndefined();
  });

  test.each([undefined, "", "   "])(
    "rejects missing provider text %#",
    (input) => {
      expect(() => parseProviderJsonEnvelope(input)).toThrow(
        expect.objectContaining({
          code: "invalid_response",
          message: "Provider response did not contain text output.",
        }),
      );
    },
  );

  test.each(["not json", "[]", "null", "123", "{}", '{"structured_json":[]}'])(
    "rejects invalid provider envelope %s",
    (input) => {
      const error = jest.spyOn(console, "error").mockImplementation(() => {});

      try {
        expect(() => parseProviderJsonEnvelope(input)).toThrow(AppError);
      } finally {
        error.mockRestore();
      }
    },
  );

  test("rejects malformed provider JSON with exact diagnostics", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(() => parseProviderJsonEnvelope("not json")).toThrow(
        expect.objectContaining({
          code: "invalid_response",
          message: "Provider response did not contain valid JSON.",
        }),
      );
      expect(error).toHaveBeenCalledWith(
        "[tolksyn] Provider returned malformed JSON:",
        "not json",
      );
    } finally {
      error.mockRestore();
    }
  });

  test.each([
    ["[]", "Provider returned JSON in an unexpected shape."],
    ["null", "Provider returned JSON in an unexpected shape."],
    ["123", "Provider returned JSON in an unexpected shape."],
    ["{}", "Provider returned an invalid structured_json object."],
    ['{"structured_json":[]}', "Provider returned an invalid structured_json object."],
  ])("rejects invalid provider envelope with exact message %s", (input, message) => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(() => parseProviderJsonEnvelope(input)).toThrow(
        expect.objectContaining({ code: "schema_violation", message }),
      );
    } finally {
      error.mockRestore();
    }
  });

  test("rejects structured payloads that fail schema validation", () => {
    expect(() =>
      parseProviderJsonEnvelope(
        JSON.stringify({ structured_json: { quantity: "1,5" } }),
      ),
    ).toThrow(
      expect.objectContaining({
        code: "schema_violation",
        message: "Provider JSON failed schema validation.",
      }),
    );
  });
});

describe("normalizeRemoteError", () => {
  test("maps plain AbortError shapes to timeout", () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";

    expect(normalizeRemoteError(abortError)).toMatchObject({
      code: "timeout",
      message: "The extraction request timed out.",
    });
    expect(normalizeRemoteError({ name: "AbortError" })).toMatchObject({
      code: "timeout",
      message: "The extraction request timed out.",
    });
    expect(
      normalizeRemoteError(new DOMException("Aborted", "AbortError")),
    ).toMatchObject({
      code: "timeout",
      message: "The extraction request timed out.",
    });
  });

  test.each([new TypeError("network down"), new Error("Network request failed")])(
    "maps network failures %#",
    (error) => {
      expect(normalizeRemoteError(error)).toMatchObject({
        code: "network_unavailable",
        message:
          "The extraction request failed due to network unavailability.",
      });
    },
  );

  test("returns existing AppError unchanged", () => {
    const source = new AppError("schema_violation", "bad schema");

    expect(normalizeRemoteError(source)).toBe(source);
  });

  test("maps empty and unknown errors to internal fallback", () => {
    expect(normalizeRemoteError(new Error(""))).toMatchObject({
      code: "internal",
      message: "The extraction request failed.",
    });
    expect(normalizeRemoteError("boom")).toMatchObject({
      code: "internal",
      message: "The extraction request failed.",
    });
    expect(normalizeRemoteError(null)).toMatchObject({
      code: "internal",
      message: "The extraction request failed.",
    });
  });
});

describe("remote extraction shared utilities", () => {
  test.each([
    [6_000, 120_000],
    [120_000, 120_000],
    [180_000, 180_000],
  ])("enforces timeout lower bound %#", (input, expected) => {
    expect(extractionTimeoutMs(input)).toBe(expected);
  });

  test("formats provider error messages", () => {
    expect(providerErrorMessage(new AppError("internal", "app failed"))).toBe(
      "app failed",
    );
    expect(providerErrorMessage(new Error("plain failed"))).toBe("plain failed");
    expect(providerErrorMessage(null)).toBe("null");
  });
});
