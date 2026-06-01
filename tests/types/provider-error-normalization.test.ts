import { normalizeRemoteError } from "@/api/providers/remote-extraction-shared";
import { AppError } from "@/types/app-error";

describe("provider error normalization", () => {
  test("maps AbortError to timeout", () => {
    // Arrange
    // Act
    const error = normalizeRemoteError(
      new DOMException("Timed out", "AbortError"),
    );

    // Assert
    // AbortError indicates the request took too long, not a provider failure
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("timeout");
  });

  test("maps network failures to network_unavailable", () => {
    // Arrange
    // Act
    const error = normalizeRemoteError(new TypeError("Network request failed"));

    // Assert
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("network_unavailable");
  });

  test("maps schema parsing failures to existing app error", () => {
    // Arrange
    const source = new AppError("schema_violation", "bad schema");

    // Act
    // AppError instances pass through unchanged, not re-wrapped
    const error = normalizeRemoteError(source);

    // Assert
    expect(error).toBe(source);
  });

  test("preserves unknown error message verbatim via internal app error", () => {
    // Arrange
    // Act
    const error = normalizeRemoteError(
      new Error("Provider returned malformed envelope"),
    );

    // Assert
    // Unknown errors fall back to internal so the app error code is always set
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("internal");
    expect(error.message).toBe("Provider returned malformed envelope");
  });
});
