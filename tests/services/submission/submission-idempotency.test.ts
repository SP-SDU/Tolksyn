import { buildSubmissionIdempotencyKey } from "@/services/submission/submission-idempotency";

describe("buildSubmissionIdempotencyKey", () => {
  test("is stable for the same attempt revision", async () => {
    const first = await buildSubmissionIdempotencyKey("attempt-1", 1);
    const second = await buildSubmissionIdempotencyKey("attempt-1", 1);

    // Same input must produce identical output (determinism)
    expect(first).toBe(second);
  });

  test("changes when the accepted revision changes", async () => {
    const first = await buildSubmissionIdempotencyKey("attempt-1", 1);
    const second = await buildSubmissionIdempotencyKey("attempt-1", 2);

    // Different revision must produce different key (uniqueness)
    expect(first).not.toBe(second);
  });
});
