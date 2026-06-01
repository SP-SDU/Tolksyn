import { emptyStructuredItem, type StructuredItem } from "../types/item-schema";

/**
 * RFC 4180 CSV for spreadsheet handoff. BOM keeps Excel from mangling UTF-8 product text.
 */
export function serializeCsv(item: StructuredItem): string {
  // Column order must match emptyStructuredItem so CSV headers align with warehouse imports.
  const empty = emptyStructuredItem();
  const keys = Object.keys(empty) as (keyof StructuredItem)[];

  const header = keys.map(escapeCsv).join(",");
  const row = keys.map((key) => escapeCsv(item[key])).join(",");

  // Excel on Windows assumes ANSI unless a BOM marks the file as UTF-8.
  return "\uFEFF" + header + "\n" + row;
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) {
    return "";
  }

  const str = String(value);

  // RFC 4180 requires quoting when the cell contains delimiter or newline characters.
  if (
    str.includes('"') ||
    str.includes(",") ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    // Embedded quotes double up per RFC 4180 escaping rules.
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}
