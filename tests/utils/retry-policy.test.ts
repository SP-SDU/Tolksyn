import {
  computeRetryDelayMs,
  isRetryableHttpStatus,
} from "@/utils/retry-policy";

describe("retry policy", () => {
  test("uses capped exponential backoff with jitter", () => {
    expect(
      computeRetryDelayMs({
        retryCount: 1,
        random: () => 0,
        baseDelayMs: 500,
        maxDelayMs: 10_000,
      }),
    ).toBe(500);
    expect(
      computeRetryDelayMs({
        retryCount: 3,
        random: () => 0.5,
        baseDelayMs: 500,
        maxDelayMs: 10_000,
      }),
    ).toBe(2000);
    expect(
      computeRetryDelayMs({
        retryCount: 10,
        random: () => 1,
        baseDelayMs: 500,
        maxDelayMs: 10_000,
      }),
    ).toBe(10_000);
  });

  test("classifies retryable transport statuses", () => {
    expect(isRetryableHttpStatus(408)).toBe(true);
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(500)).toBe(true);
    expect(isRetryableHttpStatus(422)).toBe(false);
  });
});
