import { z } from "zod";

const textFieldNames = [
  "sku",
  "manufacturer",
  "productNumber",
  "productText",
  "productVersion",
  "eanOrUpc",
  "countryOfOrigin",
  "itemCategory",
  "packaging",
  "condition",
  "externalCondition",
  "workingCondition",
  "storagePosition",
  "externalNote",
  "internalNote",
  "status",
  "advancedInformation",
  "hsCode",
  "itemGroup",
  "reference",
  "sendingType",
  "sellingType",
  "link",
] as const;

const numericFieldNames = [
  "quantity",
  "batchSize",
  "priceEur",
  "weightKg",
  "heightMm",
  "widthMm",
  "lengthMm",
] as const;

type TextFieldName = (typeof textFieldNames)[number];
type NumericFieldName = (typeof numericFieldNames)[number];

export type StructuredItem = Record<TextFieldName, string | null> &
  Record<NumericFieldName, number | null>;

export type StructuredItemInput = Partial<
  Record<TextFieldName, string | null>
> &
  Partial<Record<NumericFieldName, number | string | null>>;

type ValidationSuccess = {
  success: true;
  data: StructuredItem;
};

type ValidationFailure = {
  success: false;
  error: {
    fieldErrors: Partial<Record<keyof StructuredItem, string[]>>;
  };
};

const nullableText = z.union([z.string(), z.null()]);
const nullableNumber = z.union([z.number(), z.null()]);

const structuredItemSchema = z.object({
  sku: nullableText,
  manufacturer: nullableText,
  productNumber: nullableText,
  productText: nullableText,
  productVersion: nullableText,
  eanOrUpc: nullableText,
  countryOfOrigin: nullableText,
  itemCategory: nullableText,
  packaging: nullableText,
  condition: nullableText,
  externalCondition: nullableText,
  workingCondition: nullableText,
  quantity: nullableNumber,
  batchSize: nullableNumber,
  storagePosition: nullableText,
  externalNote: nullableText,
  internalNote: nullableText,
  priceEur: nullableNumber,
  status: nullableText,
  advancedInformation: nullableText,
  weightKg: nullableNumber,
  heightMm: nullableNumber,
  widthMm: nullableNumber,
  lengthMm: nullableNumber,
  hsCode: nullableText,
  itemGroup: nullableText,
  reference: nullableText,
  sendingType: nullableText,
  sellingType: nullableText,
  link: nullableText,
});

export function emptyStructuredItem(): StructuredItem {
  return {
    sku: null,
    manufacturer: null,
    productNumber: null,
    productText: null,
    productVersion: null,
    eanOrUpc: null,
    countryOfOrigin: null,
    itemCategory: null,
    packaging: null,
    condition: null,
    externalCondition: null,
    workingCondition: null,
    quantity: null,
    batchSize: null,
    storagePosition: null,
    externalNote: null,
    internalNote: null,
    priceEur: null,
    status: null,
    advancedInformation: null,
    weightKg: null,
    heightMm: null,
    widthMm: null,
    lengthMm: null,
    hsCode: null,
    itemGroup: null,
    reference: null,
    sendingType: null,
    sellingType: null,
    link: null,
  };
}

export function normalizeStructuredItemInput(
  input: Partial<Record<keyof StructuredItem, unknown>>,
): Record<keyof StructuredItem, string | number | null> {
  const normalized = emptyStructuredItem() as Record<
    keyof StructuredItem,
    string | number | null
  >;

  for (const field of textFieldNames) {
    normalized[field] = normalizeText(input[field]);
  }

  for (const field of numericFieldNames) {
    normalized[field] = normalizeNumberLike(input[field]);
  }

  if (normalized.link && typeof normalized.link === "string") {
    normalized.link = normalized.link.trim();
  }

  return normalized;
}

export function validateStructuredItem(
  input: Partial<Record<keyof StructuredItem, unknown>>,
): ValidationSuccess | ValidationFailure {
  const normalized = normalizeStructuredItemInput(input);
  const fieldErrors: Partial<Record<keyof StructuredItem, string[]>> = {};

  for (const field of numericFieldNames) {
    const value = normalized[field];
    if (typeof value === "string") {
      fieldErrors[field] = ["Expected a number"];
    }
  }

  if (typeof normalized.link === "string") {
    const urlResult = z
      .url({ error: "Expected a valid URL" })
      .safeParse(normalized.link);
    if (!urlResult.success) {
      fieldErrors.link = ["Expected a valid URL"];
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      error: { fieldErrors },
    };
  }

  const result = structuredItemSchema.safeParse(normalized);
  if (!result.success) {
    return {
      success: false,
      error: { fieldErrors: {} },
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

function normalizeText(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeNumberLike(value: unknown): number | string | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  const text = String(value).trim();
  if (text.length === 0) {
    return null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : text;
}
