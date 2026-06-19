import { serializeSubmissionJson } from "@/services/export-serialization";

describe("serializeSubmissionJson", () => {
  it("returns a pretty-printed JSON string", () => {
    // Arrange
    const payload = {
      schemaVersion: "tolksyn.item.v1" as const,
      attemptId: "attempt-123",
      acceptedRevision: 2,
      structuredJson: { manufacturer: "Siemens", quantity: 5 },
      barcodeEnrichment: {
        detected: [],
        primary: null,
        relatedFieldSuggestions: { eanOrUpc: null },
        conflicts: [],
      },
      metadata: { source: "camera", provider: "remote_ai_sdk" },
    };

    // Act
    const result = serializeSubmissionJson(payload);

    // Assert
    // Pretty-printed output must include readable key names and be parseable
    expect(result).toContain('"schemaVersion": "tolksyn.item.v1"');
    expect(result).toContain('"attemptId": "attempt-123"');
    expect(result).toContain('"manufacturer": "Siemens"');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("handles null auxiliaryText and empty metadata", () => {
    // Arrange
    const payload = {
      schemaVersion: "tolksyn.item.v1" as const,
      attemptId: "attempt-456",
      acceptedRevision: 1,
      structuredJson: {},
      barcodeEnrichment: {
        detected: [],
        primary: null,
        relatedFieldSuggestions: { eanOrUpc: null },
        conflicts: [],
      },
      auxiliaryText: undefined,
      metadata: {},
    };

    // Act
    const result = serializeSubmissionJson(payload);
    const parsed = JSON.parse(result);

    // Assert
    // Optional fields omitted in input must be absent from output, not null
    expect(parsed.attemptId).toBe("attempt-456");
    expect(parsed.auxiliaryText).toBeUndefined();
  });

  it("outputs valid JSON for a full payload with barcodes", () => {
    // Arrange
    const payload = {
      schemaVersion: "tolksyn.item.v1" as const,
      attemptId: "attempt-789",
      acceptedRevision: 3,
      structuredJson: { eanOrUpc: "4046356160483", productNumber: "2865463" },
      barcodeEnrichment: {
        detected: [{ type: "ean13", data: "4046356160483" }],
        primary: { type: "ean13", data: "4046356160483" },
        relatedFieldSuggestions: { eanOrUpc: "4046356160483" },
        conflicts: [],
      },
      auxiliaryText: "Extracted text",
      metadata: { source: "gallery", provider: "remote_openai_compatible" },
    };

    // Act
    const result = serializeSubmissionJson(payload);
    const parsed = JSON.parse(result);

    // Assert
    expect(parsed.barcodeEnrichment.detected).toHaveLength(1);
    expect(parsed.auxiliaryText).toBe("Extracted text");
  });
});
