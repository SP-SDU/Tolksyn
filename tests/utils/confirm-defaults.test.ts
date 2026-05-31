import { emptyStructuredItem } from "@/types/item-schema";
import { applyConfirmDefaults } from "@/utils/confirm-defaults";

describe("applyConfirmDefaults", () => {
  it('sets condition to "Used" when null', () => {
    const draft = emptyStructuredItem();
    const result = applyConfirmDefaults(draft);

    expect(result.condition).toBe("Used");
  });

  it("does not overwrite an existing condition", () => {
    const draft = { ...emptyStructuredItem(), condition: "New" };
    const result = applyConfirmDefaults(draft);

    expect(result.condition).toBe("New");
  });

  it("sets quantity to 1 when null", () => {
    const draft = emptyStructuredItem();
    const result = applyConfirmDefaults(draft);

    expect(result.quantity).toBe(1);
  });

  it("does not overwrite an existing quantity", () => {
    const draft = { ...emptyStructuredItem(), quantity: 10 };
    const result = applyConfirmDefaults(draft);

    expect(result.quantity).toBe(10);
  });

  it("preserves all other fields unchanged", () => {
    const draft = {
      ...emptyStructuredItem(),
      manufacturer: "Siemens",
      productNumber: "6ES7331-7KF02-0AB0",
      priceEur: 125.0,
    };
    const result = applyConfirmDefaults(draft);

    expect(result.manufacturer).toBe("Siemens");
    expect(result.productNumber).toBe("6ES7331-7KF02-0AB0");
    expect(result.priceEur).toBe(125.0);
  });

  it("applies both defaults when both are null", () => {
    const draft = emptyStructuredItem();
    const result = applyConfirmDefaults(draft);

    expect(result.condition).toBe("Used");
    expect(result.quantity).toBe(1);
  });
});
