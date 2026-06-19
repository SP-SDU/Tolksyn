import {
  emptyStructuredItem,
  normalizeStructuredItemInput,
  validateStructuredItem,
} from "@/types/item-schema";

describe("item schema", () => {
  test("normalizes empty strings and numeric fields", () => {
    const normalized = normalizeStructuredItemInput({
      ...emptyStructuredItem(),
      manufacturer: "  Siemens  ",
      quantity: "2",
      batchSize: "",
      priceEur: "123.45",
      link: " https://example.com/item ",
      externalNote: " ",
    });

    // Whitespace trimmed from text fields. Blanks become null. Numeric strings parsed to numbers
    expect(normalized.manufacturer).toBe("Siemens");
    expect(normalized.quantity).toBe(2);
    expect(normalized.batchSize).toBeNull();
    expect(normalized.priceEur).toBe(123.45);
    expect(normalized.link).toBe("https://example.com/item");
    expect(normalized.externalNote).toBeNull();
  });

  test("reports schema violations for invalid URLs and numbers", () => {
    const result = validateStructuredItem({
      ...emptyStructuredItem(),
      quantity: "nope",
      link: "notaurl",
    });

    // Validation must reject clearly invalid input before submission
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected validation to fail");
    }

    expect(result.error.fieldErrors.quantity).toContain("Expected a number");
    expect(result.error.fieldErrors.link).toContain("Expected a valid URL");
  });
});
