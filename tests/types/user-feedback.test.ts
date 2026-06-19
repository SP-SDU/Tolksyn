import { AppError } from "@/types/app-error";
import { getUserFacingErrorMessage } from "@/types/user-feedback";

describe("getUserFacingErrorMessage", () => {
  test("maps permission_denied to a clear message", () => {
    const message = getUserFacingErrorMessage(
      new AppError("permission_denied", "denied"),
      "fallback",
    );

    // Permission denials must include actionable user guidance
    expect(message).toBe(
      "Permission denied. Please grant the required access in system settings.",
    );
  });

  test("maps network errors to retry guidance", () => {
    const message = getUserFacingErrorMessage(
      new AppError("network_unavailable", "offline"),
      "fallback",
    );

    expect(message).toBe(
      "Network unavailable. Check your connection and try again.",
    );
  });

  test("falls back for unknown errors", () => {
    const message = getUserFacingErrorMessage(new Error("x"), "fallback");

    // Unrecognized errors degrade gracefully to a generic fallback string
    expect(message).toBe("fallback");
  });
});
