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

/** Ingest rejects partial objects, and null marks unknown fields without dropping keys. */
export type StructuredItem = Record<TextFieldName, string | null> &
  Record<NumericFieldName, number | null>;

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

/** Confirm text fields and model JSON disagree on empty vs omitted, so validation needs one shape. */
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
    const urlResult = z.url().safeParse(normalized.link);
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

  return {
    success: true,
    data: normalized as StructuredItem,
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

  const text = String(value).trim();
  if (text.length === 0) {
    return null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : text;
}
