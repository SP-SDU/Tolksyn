import { emptyStructuredItem, type StructuredItem } from '../types/item-schema';

/**
 * Serializes a StructuredItem to a CSV string following US formatting (RFC 4180).
 * 
 * Includes a UTF-8 BOM for Excel compatibility.
 */
export function serializeCsv(item: StructuredItem): string {
  // Use the empty object to guarantee a consistent column order
  const empty = emptyStructuredItem();
  const keys = Object.keys(empty) as (keyof StructuredItem)[];

  const header = keys.map(escapeCsv).join(',');
  const row = keys.map((key) => escapeCsv(item[key])).join(',');

  // Add UTF-8 BOM (\uFEFF) at the start for Excel
  return '\uFEFF' + header + '\n' + row;
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) {
    return '';
  }

  const str = String(value);

  // If it contains double quote, comma, or newline, it must be quoted
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    // Double up inner quotes
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}
