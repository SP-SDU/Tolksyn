import { applyConfirmDefaults } from "@/services/confirmation-defaults";
import { emptyStructuredItem } from "@/types/item-schema";

describe("applyConfirmDefaults", () => {
  it('sets condition to "Used" when null', () => {
    // Arrange
    const draft = emptyStructuredItem();

    // Act
    const result = applyConfirmDefaults(draft);

    // Assert
    // Default condition ensures the field is never empty on the confirm screen
    expect(result.condition).toBe("Used");
  });

  it("does not overwrite an existing condition", () => {
    // Arrange
    const draft = { ...emptyStructuredItem(), condition: "New" };

    // Act
    const result = applyConfirmDefaults(draft);

    // Assert
    // User-set values take priority over defaults
    expect(result.condition).toBe("New");
  });

  it("sets quantity to 1 when null", () => {
    // Arrange
    const draft = emptyStructuredItem();

    // Act
    const result = applyConfirmDefaults(draft);

    // Assert
    // Default quantity avoids a blank numeric field on the confirm screen
    expect(result.quantity).toBe(1);
  });

  it("does not overwrite an existing quantity", () => {
    // Arrange
    const draft = { ...emptyStructuredItem(), quantity: 10 };

    // Act
    const result = applyConfirmDefaults(draft);

    // Assert
    expect(result.quantity).toBe(10);
  });

  it("preserves all other fields unchanged", () => {
    // Arrange
    const draft = {
      ...emptyStructuredItem(),
      manufacturer: "Siemens",
      productNumber: "6ES7331-7KF02-0AB0",
      priceEur: 125.0,
    };

    // Act
    const result = applyConfirmDefaults(draft);

    // Assert
    // Defaults scoped to condition/quantity only. Unrelated fields left alone
    expect(result.manufacturer).toBe("Siemens");
    expect(result.productNumber).toBe("6ES7331-7KF02-0AB0");
    expect(result.priceEur).toBe(125.0);
  });

  it("applies both defaults when both are null", () => {
    // Arrange
    const draft = emptyStructuredItem();

    // Act
    const result = applyConfirmDefaults(draft);

    // Assert
    expect(result.condition).toBe("Used");
    expect(result.quantity).toBe(1);
  });
});
