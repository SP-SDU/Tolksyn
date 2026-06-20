import { computeRetryDelayMs } from "@/services/submission/queue-retry-policy";

describe("retry policy", () => {
  test("uses capped exponential backoff with jitter", () => {
    // retryCount=1 with no jitter produces exactly baseDelayMs
    expect(
      computeRetryDelayMs({
        retryCount: 1,
        random: () => 0,
        baseDelayMs: 500,
        maxDelayMs: 10_000,
      }),
    ).toBe(500);
    // retryCount=3 with 0.5 jitter: 500 * 2^2 * 0.5 = 2000
    expect(
      computeRetryDelayMs({
        retryCount: 3,
        random: () => 0.5,
        baseDelayMs: 500,
        maxDelayMs: 10_000,
      }),
    ).toBe(2000);
    // retryCount=10 capped at maxDelayMs=10_000
    expect(
      computeRetryDelayMs({
        retryCount: 10,
        random: () => 1,
        baseDelayMs: 500,
        maxDelayMs: 10_000,
      }),
    ).toBe(10_000);
  });

  test("uses default retry delay bounds when none are provided", () => {
    expect(
      computeRetryDelayMs({
        retryCount: 1,
        random: () => 0,
      }),
    ).toBe(500);
  });
});
