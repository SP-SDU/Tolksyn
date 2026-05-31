import { buildIdempotencyKey } from "@/utils/idempotency";

describe("buildIdempotencyKey", () => {
  test("is stable for the same attempt revision", async () => {
    const first = await buildIdempotencyKey("attempt-1", 1);
    const second = await buildIdempotencyKey("attempt-1", 1);

    expect(first).toBe(second);
  });

  test("changes when the accepted revision changes", async () => {
    const first = await buildIdempotencyKey("attempt-1", 1);
    const second = await buildIdempotencyKey("attempt-1", 2);

    expect(first).not.toBe(second);
  });
});
