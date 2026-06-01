import type { StructuredItem } from "../types/item-schema";

/** Warehouse policy treats blank condition as Used and blank quantity as one unit. */
export function applyConfirmDefaults(draft: StructuredItem): StructuredItem {
  return {
    ...draft,
    condition: draft.condition ?? "Used",
    quantity: draft.quantity ?? 1,
  };
}
