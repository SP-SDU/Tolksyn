import { parseProviderJsonEnvelope } from "@/api/providers/remote-extraction-shared";

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
});
