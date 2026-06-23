import { normalizeRemoteError } from "@/services/extraction/errors";
import { AppError } from "@/types/app-error";

describe("provider error normalization", () => {
  test("maps AbortError to timeout", () => {
    const error = normalizeRemoteError(
      new DOMException("Timed out", "AbortError"),
    );

    // AbortError indicates the request took too long, not a provider failure
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("timeout");
  });

  test("maps network failures to network_unavailable", () => {
    const error = normalizeRemoteError(new TypeError("Network request failed"));

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("network_unavailable");
  });

  test("maps schema parsing failures to existing app error", () => {
    const source = new AppError("schema_violation", "bad schema");

    // AppError instances pass through unchanged, not re-wrapped
    const error = normalizeRemoteError(source);

    expect(error).toBe(source);
  });

  test("preserves unknown error message verbatim via internal app error", () => {
    const error = normalizeRemoteError(
      new Error("Provider returned malformed envelope"),
    );

    // Unknown errors fall back to internal so the app error code is always set
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("internal");
    expect(error.message).toBe("Provider returned malformed envelope");
  });
});
