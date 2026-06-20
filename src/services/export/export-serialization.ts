import { emptyStructuredItem, type StructuredItem } from "@/types/item-schema";
import type { SubmissionPayload } from "@/types/submission";

export function serializeSubmissionJson(payload: SubmissionPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function serializeStructuredItemCsv(item: StructuredItem): string {
  const empty = emptyStructuredItem();
  const keys = Object.keys(empty) as (keyof StructuredItem)[];

  const header = keys.map(escapeCsv).join(",");
  const row = keys.map((key) => escapeCsv(item[key])).join(",");

  return "\uFEFF" + header + "\n" + row;
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) {
    return "";
  }

  const str = String(value);

  if (
    str.includes('"') ||
    str.includes(",") ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}
