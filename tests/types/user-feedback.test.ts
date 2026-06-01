import { AppError } from "@/types/app-error";
import { getUserFacingErrorMessage } from "@/types/user-feedback";

describe("getUserFacingErrorMessage", () => {
  test("maps permission_denied to a clear message", () => {
    // Arrange
    // Act
    const message = getUserFacingErrorMessage(
      new AppError("permission_denied", "denied"),
      "fallback",
    );

    // Assert
    // Permission denials must include actionable user guidance
    expect(message).toBe(
      "Permission denied. Please grant the required access in system settings.",
    );
  });

  test("maps network errors to retry guidance", () => {
    // Arrange
    // Act
    const message = getUserFacingErrorMessage(
      new AppError("network_unavailable", "offline"),
      "fallback",
    );

    // Assert
    expect(message).toBe(
      "Network unavailable. Check your connection and try again.",
    );
  });

  test("falls back for unknown errors", () => {
    // Arrange
    // Act
    const message = getUserFacingErrorMessage(new Error("x"), "fallback");

    // Assert
    // Unrecognized errors degrade gracefully to a generic fallback string
    expect(message).toBe("fallback");
  });
});
