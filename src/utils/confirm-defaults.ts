import type { StructuredItem } from "../types/item-schema";

export function applyConfirmDefaults(draft: StructuredItem): StructuredItem {
  return {
    ...draft,
    condition: draft.condition ?? "Used",
    quantity: draft.quantity ?? 1,
  };
}
