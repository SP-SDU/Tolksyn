import { buildIdempotencyKey } from "@/utils/idempotency";

describe("buildIdempotencyKey", () => {
  test("is stable for the same attempt revision", async () => {
    // Arrange
    // Act
    const first = await buildIdempotencyKey("attempt-1", 1);
    const second = await buildIdempotencyKey("attempt-1", 1);

    // Assert
    // Same input must produce identical output (determinism)
    expect(first).toBe(second);
  });

  test("changes when the accepted revision changes", async () => {
    // Arrange
    // Act
    const first = await buildIdempotencyKey("attempt-1", 1);
    const second = await buildIdempotencyKey("attempt-1", 2);

    // Assert
    // Different revision must produce different key (uniqueness)
    expect(first).not.toBe(second);
  });
});
