import { emptyStructuredItem } from "@/types/item-schema";
import { serializeCsv } from "@/utils/serialize-csv";

describe("serializeCsv", () => {
  it("starts with UTF-8 BOM", () => {
    // Arrange
    // Act
    const result = serializeCsv(emptyStructuredItem());

    // Assert
    // BOM signals Excel that the file is UTF-8, not ANSI
    expect(result.charCodeAt(0)).toBe(0xfeff);
  });

  it("includes a header row with all field keys", () => {
    // Arrange
    // Act
    const result = serializeCsv(emptyStructuredItem());
    const lines = result.split("\n");
    const header = lines[0];

    // Assert
    // Each key appears in the header to map columns for spreadsheet import
    expect(header).toContain("sku");
    expect(header).toContain("manufacturer");
    expect(header).toContain("productNumber");
    expect(header).toContain("quantity");
    expect(header).toContain("priceEur");
    expect(header).toContain("link");
  });

  it("outputs one data row", () => {
    // Arrange
    // Act
    const result = serializeCsv(emptyStructuredItem());
    const lines = result.split("\n");

    // Assert
    // Header and one data row equals exactly 2 lines
    expect(lines).toHaveLength(2);
  });

  it("escapes fields containing commas", () => {
    // Arrange
    const item = { ...emptyStructuredItem(), manufacturer: "Siemens, AG" };

    // Act
    const result = serializeCsv(item);

    // Assert
    // Comma inside value must be wrapped in quotes to preserve column alignment
    expect(result).toContain('"Siemens, AG"');
  });

  it("escapes fields containing double quotes", () => {
    // Arrange
    const item = { ...emptyStructuredItem(), productText: 'Length 12" unit' };

    // Act
    const result = serializeCsv(item);
    const row = result.split("\n")[1];
    const cells = row.split(",");

    const productTextIndex = Object.keys(emptyStructuredItem()).indexOf(
      "productText",
    );
    const cell = cells[productTextIndex];

    // Assert
    // Double quotes inside a value are escaped by doubling per RFC 4180
    expect(cell).toBe('"Length 12"" unit"');
  });

  it("escapes fields containing newlines", () => {
    // Arrange
    const item = { ...emptyStructuredItem(), externalNote: "Line 1\nLine 2" };

    // Act
    const result = serializeCsv(item);

    // Assert
    // Newline inside a value must be wrapped in quotes to avoid row break
    expect(result).toContain('"Line 1');
    expect(result).toContain('Line 2"');
  });

  it("outputs null fields as empty cells", () => {
    // Arrange
    // Act
    const result = serializeCsv(emptyStructuredItem());
    const row = result.split("\n")[1];

    // Assert
    // Null must produce empty cell, not the literal string "null"
    expect(row).not.toContain("null");
  });

  it("outputs numeric values as-is without quotes", () => {
    // Arrange
    const item = { ...emptyStructuredItem(), quantity: 5, priceEur: 12.5 };

    // Act
    const result = serializeCsv(item);
    const row = result.split("\n")[1];
    const keys = Object.keys(emptyStructuredItem());
    const quantityIndex = keys.indexOf("quantity");
    const priceIndex = keys.indexOf("priceEur");
    const cells = row.split(",");

    // Assert
    // Bare numbers let spreadsheet apps treat them as numeric cells
    expect(cells[quantityIndex]).toBe("5");
    expect(cells[priceIndex]).toBe("12.5");
  });

  it("outputs text values without quotes when safe", () => {
    // Arrange
    const item = { ...emptyStructuredItem(), manufacturer: "Siemens" };

    // Act
    const result = serializeCsv(item);
    const keys = Object.keys(emptyStructuredItem());
    const manufacturerIndex = keys.indexOf("manufacturer");
    const cells = result.split("\n")[1].split(",");

    // Assert
    // Plain text with no special chars should not be quoted unnecessarily
    expect(cells[manufacturerIndex]).toBe("Siemens");
  });
});
