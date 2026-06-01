import { buildExtractionPrompt } from "@/api/providers/extraction-prompt";

describe("buildExtractionPrompt", () => {
  test("includes required response keys and all structured fields", () => {
    // Arrange
    // Act
    const prompt = buildExtractionPrompt();

    // Assert
    // Top-level response envelope keys
    expect(prompt).toContain("structured_json");
    expect(prompt).toContain("auxiliary_text_optional");
    // Every field that the extraction pipeline expects to be populated
    expect(prompt).toContain("sku");
    expect(prompt).toContain("manufacturer");
    expect(prompt).toContain("productNumber");
    expect(prompt).toContain("eanOrUpc");
    expect(prompt).toContain("quantity");
    expect(prompt).toContain("priceEur");
    expect(prompt).toContain("weightKg");
    expect(prompt).toContain("link");
  });

  test("forces strict json-only response guidance", () => {
    // Arrange
    // Act
    const prompt = buildExtractionPrompt();

    // Assert
    // The prompt must forbid explanatory text so JSON.parse never fails
    expect(prompt).toContain(
      "Return one single complete valid JSON object only",
    );
    expect(prompt).toContain("Do not add markdown");
    expect(prompt).toContain("JSON must be parseable by JSON.parse");
  });
});
