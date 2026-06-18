import { emptyStructuredItem } from "@/types/item-schema";
import {
  AUXILIARY_ENVELOPE_KEY,
  normalizeAuxiliaryText,
  normalizeStructuredObjectKeys,
  parseLooseJson,
  readEnvelopeValue,
  STRUCTURED_ENVELOPE_KEY,
  toObjectValue,
} from "@/api/providers/remote-extraction-repair";

describe("remote extraction repair helpers", () => {
  test("exports strict envelope key names", () => {
    expect(STRUCTURED_ENVELOPE_KEY).toBe("structured_json");
    expect(AUXILIARY_ENVELOPE_KEY).toBe("auxiliary_text_optional");
  });

  test("parseLooseJson accepts raw, fenced, trailed-comma, and embedded JSON", () => {
    expect(parseLooseJson('{"ok":true}')).toEqual({
      ok: true,
      value: { ok: true },
    });
    expect(parseLooseJson("```json\n{\"ok\":true,}\n```")).toEqual({
      ok: true,
      value: { ok: true },
    });
    expect(parseLooseJson("  ```\r\n{\"ok\":true}\r\n```  ")).toEqual({
      ok: true,
      value: { ok: true },
    });
    expect(parseLooseJson("```json\n\"fenced string\"\n```")).toEqual({
      ok: true,
      value: "fenced string",
    });
    expect(parseLooseJson("```\r\n123\r\n```")).toEqual({
      ok: true,
      value: 123,
    });
    expect(
      parseLooseJson('provider said {"note":"brace } in string","rows":[1,2,]} done'),
    ).toEqual({
      ok: true,
      value: { note: "brace } in string", rows: [1, 2] },
    });
    expect(parseLooseJson("prefix [1,2,] suffix")).toEqual({
      ok: true,
      value: [1, 2],
    });
    expect(parseLooseJson('{"ok":true} tail')).toEqual({
      ok: true,
      value: { ok: true },
    });
    expect(parseLooseJson('prefix {"nested":{"ok":true}} suffix')).toEqual({
      ok: true,
      value: { nested: { ok: true } },
    });
    expect(
      parseLooseJson('prefix {"note":"escaped \\\" } text","ok":true} suffix'),
    ).toEqual({
      ok: true,
      value: { note: 'escaped " } text', ok: true },
    });
    expect(parseLooseJson("  ```json\n123\n```  ")).toEqual({
      ok: true,
      value: 123,
    });
    expect(parseLooseJson("```json\n{\n\"ok\": true\n}\n```")).toEqual({
      ok: true,
      value: { ok: true },
    });
    expect(parseLooseJson('prefix {"note":"\\\" } text","ok":true} suffix')).toEqual({
      ok: true,
      value: { note: '\" } text', ok: true },
    });
  });

  test("parseLooseJson rejects empty or unbalanced input", () => {
    const empty = parseLooseJson("   ");
    const unbalanced = parseLooseJson('prefix {"ok": true');
    const bareFence = parseLooseJson("```");
    const brokenFence = parseLooseJson("```json\n{\"ok\":true}\nnot-a-fence```");

    expect(empty.ok).toBe(false);
    expect(unbalanced.ok).toBe(false);
    expect(bareFence.ok).toBe(false);
    expect(brokenFence).toEqual({ ok: true, value: { ok: true } });
    expect(parseLooseJson("not json")).toMatchObject({
      ok: false,
      error: expect.any(SyntaxError),
    });
    expect(parseLooseJson("   ")).toMatchObject({
      ok: false,
      error: expect.objectContaining({
        message: "No JSON candidate could be parsed.",
      }),
    });
    expect(parseLooseJson("prefix ```json\n123\n``` suffix")).toMatchObject({
      ok: false,
      error: expect.any(SyntaxError),
    });
  });

  test("readEnvelopeValue prefers exact keys before aliases", () => {
    const record = {
      structured_json: { sku: "exact" },
      structuredJson: { sku: "alias" },
      auxiliary_text_optional: "exact note",
      auxiliaryText: "alias note",
    };

    expect(readEnvelopeValue(record, STRUCTURED_ENVELOPE_KEY)).toEqual({
      sku: "exact",
    });
    expect(readEnvelopeValue(record, AUXILIARY_ENVELOPE_KEY)).toBe(
      "exact note",
    );
    expect(
      readEnvelopeValue(
        {
          structuredJson: { sku: "alias first" },
          structured_json: { sku: "exact second" },
        },
        STRUCTURED_ENVELOPE_KEY,
      ),
    ).toEqual({ sku: "exact second" });
  });

  test("readEnvelopeValue accepts envelope aliases and safe fuzzy matches", () => {
    expect(
      readEnvelopeValue({ structuredJson: { sku: "camel" } }, STRUCTURED_ENVELOPE_KEY),
    ).toEqual({ sku: "camel" });
    expect(
      readEnvelopeValue({ structured: { sku: "short" } }, STRUCTURED_ENVELOPE_KEY),
    ).toEqual({ sku: "short" });
    expect(
      readEnvelopeValue({ strutured_json: { sku: "fuzzy" } }, STRUCTURED_ENVELOPE_KEY),
    ).toEqual({ sku: "fuzzy" });
    expect(readEnvelopeValue({ auxiliary: "note" }, AUXILIARY_ENVELOPE_KEY)).toBe(
      "note",
    );
    expect(
      readEnvelopeValue({ auxiliaryText: "alias text" }, AUXILIARY_ENVELOPE_KEY),
    ).toBe("alias text");
    expect(
      readEnvelopeValue({ auxilary_text_optional: "fuzzy note" }, AUXILIARY_ENVELOPE_KEY),
    ).toBe("fuzzy note");
    expect(
      readEnvelopeValue({ structured_jxxx: { sku: "limit" } }, STRUCTURED_ENVELOPE_KEY),
    ).toEqual({ sku: "limit" });
    expect(
      readEnvelopeValue(
        { structuredJson: { sku: "first alias" }, structured: { sku: "second alias" } },
        STRUCTURED_ENVELOPE_KEY,
      ),
    ).toEqual({ sku: "first alias" });
    expect(
      readEnvelopeValue(
        { auxiliaryText: "first alias", auxiliary: "second alias" },
        AUXILIARY_ENVELOPE_KEY,
      ),
    ).toBe("first alias");
  });

  test("readEnvelopeValue rejects missing and ambiguous fuzzy envelope keys", () => {
    expect(readEnvelopeValue({}, STRUCTURED_ENVELOPE_KEY)).toBeUndefined();
    expect(readEnvelopeValue({ other: 1 }, STRUCTURED_ENVELOPE_KEY)).toBeUndefined();
    expect(
      readEnvelopeValue({ structured_json_extra_far: 1 }, STRUCTURED_ENVELOPE_KEY),
    ).toBeUndefined();
    expect(
      readEnvelopeValue(
        { strxctured_json: 1, structxred_json: 2 },
        STRUCTURED_ENVELOPE_KEY,
      ),
    ).toBeUndefined();
  });

  test("toObjectValue accepts objects and stringified objects only", () => {
    const object = { manufacturer: "Siemens" };

    expect(toObjectValue(object)).toBe(object);
    expect(toObjectValue(JSON.stringify(object))).toEqual(object);
    expect(toObjectValue(null)).toBeUndefined();
    expect(toObjectValue([])).toBeUndefined();
    expect(toObjectValue("[]")).toBeUndefined();
    expect(toObjectValue("null")).toBeUndefined();
    expect(toObjectValue("false")).toBeUndefined();
    expect(toObjectValue("123")).toBeUndefined();
    expect(toObjectValue("not json")).toBeUndefined();
  });

  test("normalizeStructuredObjectKeys maps exact, normalized, alias, and fuzzy keys", () => {
    const normalized = normalizeStructuredObjectKeys({
      manufacturer: "Exact Manufacturer",
      ManufacturerName: "Alias Manufacturer",
      product_number: "3RW4027-2BB04",
      productNumbrr: "3RW4027-2BB05",
      ean: "4000000000000",
      upc: "042100005264",
      barcode: "4046356160483",
      qty: "3",
      quantitty: "4",
      url: "https://example.com/url",
      website: "https://example.com/site",
      price: "1,234.50",
      unknownField: "ignored",
    });

    expect(normalized).toMatchObject({
      manufacturer: "Exact Manufacturer",
      productNumber: "3RW4027-2BB04",
      eanOrUpc: "4000000000000",
      quantity: 3,
      link: "https://example.com/url",
      priceEur: 1234.5,
    });
    expect(normalized).not.toHaveProperty("unknownField");
  });

  test("normalizeStructuredObjectKeys lets stronger field matches overwrite weaker matches", () => {
    expect(
      normalizeStructuredObjectKeys({
        manufactuer: "Alias Manufacturer",
        manufacturer: "Exact Manufacturer",
        productno: "Alias Product",
        product_number: "Normalized Product",
      }),
    ).toEqual({
      manufacturer: "Exact Manufacturer",
      productNumber: "Normalized Product",
    });
    expect(
      normalizeStructuredObjectKeys({
        product_number: "Normalized Product",
        productNumber: "Exact Product",
      }),
    ).toEqual({
      productNumber: "Exact Product",
    });
  });

  test("normalizeStructuredObjectKeys lets alias matches overwrite fuzzy matches", () => {
    expect(
      normalizeStructuredObjectKeys({
        manufacturerx: "Fuzzy Manufacturer",
        manufacturerxx: "Fuzzy Manufacturer Name",
        manufacturername: "Alias Manufacturer Name",
        manufactuer: "Alias Manufacturer",
        productNumbrr: "Fuzzy Product",
        productnum: "Alias Product",
        eanOrUpcx: "Fuzzy Barcode",
        eanupc: "Alias EAN UPC",
        barcode: "Alias Barcode",
        quantitx: "6",
        quantitty: "7",
      }),
    ).toMatchObject({
      manufacturer: "Alias Manufacturer Name",
      productNumber: "Alias Product",
      eanOrUpc: "Alias EAN UPC",
      quantity: 7,
    });
    expect(
      normalizeStructuredObjectKeys({
        manfacturer: "Fuzzy Manufacturer",
        manufactuer: "Alias Manufacturer",
      }),
    ).toEqual({
      manufacturer: "Alias Manufacturer",
    });
  });

  test.each([
    ["manufactuer", "manufacturer", "Siemens"],
    ["manufacturername", "manufacturer", "Phoenix Contact"],
    ["productno", "productNumber", "A"],
    ["productnr", "productNumber", "B"],
    ["productnum", "productNumber", "C"],
    ["ean", "eanOrUpc", "4000000000000"],
    ["upc", "eanOrUpc", "042100005264"],
    ["eanupc", "eanOrUpc", "4046356160483"],
    ["barcode", "eanOrUpc", "1234567890123"],
    ["qty", "quantity", 3],
    ["quantitty", "quantity", 4],
    ["url", "link", "https://example.com/url"],
    ["website", "link", "https://example.com/site"],
    ["price", "priceEur", 1234.5],
  ] as const)("normalizes alias %s", (inputKey, outputKey, expected) => {
    const value =
      inputKey === "qty" || inputKey === "quantitty"
        ? String(expected)
        : inputKey === "price"
          ? "1,234.50"
          : expected;

    expect(normalizeStructuredObjectKeys({ [inputKey]: value })).toEqual({
      [outputKey]: expected,
    });
  });

  test("normalizeStructuredObjectKeys accepts fuzzy matches across distance limits", () => {
    expect(normalizeStructuredObjectKeys({ sk: "SKU-1" })).toEqual({
      sku: "SKU-1",
    });
    expect(normalizeStructuredObjectKeys({ quantitx: "5" })).toEqual({
      quantity: 5,
    });
    expect(normalizeStructuredObjectKeys({ productNumbrr: "PN-1" })).toEqual({
      productNumber: "PN-1",
    });
    expect(normalizeStructuredObjectKeys({ advancedInformotion: "details" })).toEqual({
      advancedInformation: "details",
    });
    expect(normalizeStructuredObjectKeys({ skx: "SKU-2" })).toEqual({
      sku: "SKU-2",
    });
    expect(normalizeStructuredObjectKeys({ hsCodexx: "8536" })).toEqual({
      hsCode: "8536",
    });
    expect(normalizeStructuredObjectKeys({ weightmm: "12" })).toEqual({
      heightMm: 12,
    });
  });

  test("normalizeStructuredObjectKeys rejects unsafe fuzzy matches", () => {
    expect(normalizeStructuredObjectKeys({ zz: "too short" })).toEqual({});
    expect(normalizeStructuredObjectKeys({ skxx: "too far" })).toEqual({});
    expect(normalizeStructuredObjectKeys({ hsCodxxx: "too far" })).toEqual({});
    expect(normalizeStructuredObjectKeys({ productNumzzzz: "too far" })).toEqual({});
    expect(normalizeStructuredObjectKeys({ "!!!": "empty token" })).toEqual({});
    expect(normalizeStructuredObjectKeys({ completely_unrelated_key: "x" })).toEqual(
      {},
    );
  });

  test.each([
    ["quantity", " 12 ", 12],
    ["quantity", "\t12\t", 12],
    ["batchSize", "1_000", 1000],
    ["priceEur", "+1,234.50", 1234.5],
    ["priceEur", "1,234,567.89", 1234567.89],
    ["priceEur", "12,345", 12345],
    ["priceEur", "123,456", 123456],
    ["priceEur", "+123", 123],
    ["weightKg", "-12.25", -12.25],
    ["heightMm", "100", 100],
    ["widthMm", "200", 200],
    ["lengthMm", "300", 300],
  ] as const)("normalizes numeric field %s", (field, value, expected) => {
    expect(normalizeStructuredObjectKeys({ [field]: value })).toEqual({
      [field]: expected,
    });
  });

  test("normalizeStructuredObjectKeys preserves non-numeric and ambiguous numeric values", () => {
    expect(
      normalizeStructuredObjectKeys({
        manufacturer: "123",
        quantity: "",
        batchSize: "1,5",
        storagePosition: "0x10",
        itemGroup: "123e2",
        lengthMm: "xx123",
        heightMm: "a1,234.50",
        widthMm: "1,234.50x",
        priceEur: "12abc",
        weightKg: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({
      manufacturer: "123",
      quantity: "",
      batchSize: "1,5",
      storagePosition: "0x10",
      itemGroup: "123e2",
      lengthMm: "xx123",
      heightMm: "a1,234.50",
      widthMm: "1,234.50x",
      priceEur: "12abc",
      weightKg: Number.POSITIVE_INFINITY,
    });
  });

  test("normalizeStructuredObjectKeys covers every structured field by exact key", () => {
    const item = emptyStructuredItem();
    const input = Object.fromEntries(
      Object.keys(item).map((field) => [field, `${field}-value`]),
    );

    expect(Object.keys(normalizeStructuredObjectKeys(input)).sort()).toEqual(
      Object.keys(item).sort(),
    );
  });

  test("normalizeAuxiliaryText trims text, stringifies objects, and drops other values", () => {
    expect(normalizeAuxiliaryText("  note  ")).toBe("note");
    expect(normalizeAuxiliaryText("   ")).toBeUndefined();
    expect(normalizeAuxiliaryText({ source: "operator" })).toBe(
      '{"source":"operator"}',
    );
    expect(normalizeAuxiliaryText(123)).toBeUndefined();
    expect(normalizeAuxiliaryText(false)).toBeUndefined();
  });
});
