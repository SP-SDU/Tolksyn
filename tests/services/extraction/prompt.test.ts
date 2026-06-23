import { buildExtractionPrompt } from "@/services/extraction/prompt";
import { emptyStructuredItem } from "@/types/item-schema";

describe("buildExtractionPrompt", () => {
  test("includes required response keys and all structured fields", () => {
    const prompt = buildExtractionPrompt();

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
    const prompt = buildExtractionPrompt();

    // The prompt must forbid explanatory text so JSON.parse never fails
    expect(prompt).toContain(
      "Return one single complete valid JSON object only",
    );
    expect(prompt).toContain("Do not add markdown");
    expect(prompt).toContain("JSON must be parseable by JSON.parse");
  });

  test("matches the full prompt contract exactly", () => {
    const structuredFields = Object.keys(emptyStructuredItem()).join(", ");

    expect(buildExtractionPrompt()).toBe(
      [
        "Extract product label data to a strict JSON object.",
        "Return one single complete valid JSON object only. Do not stream partial fragments.",
        "Do not add markdown, code fences, comments, notes, or prose.",
        "Use top-level keys: structured_json and auxiliary_text_optional.",
        "structured_json must be an object with exactly these keys:",
        structuredFields,
        "If a value is unknown, use null.",
        "Use number for numeric fields and string for text fields.",
        "Preserve literal barcode-like strings in text fields like eanOrUpc without formatting changes.",
        "All keys must be present exactly once. Never omit keys.",
        "JSON must be parseable by JSON.parse without edits.",
      ].join(" "),
    );
  });
});
