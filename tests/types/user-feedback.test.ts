import { AppError } from "@/types/app-error";
import { getUserFacingErrorMessage } from "@/types/user-feedback";

describe("getUserFacingErrorMessage", () => {
  test.each([
    [
      "permission_denied",
      "Permission denied. Please grant the required access in system settings.",
    ],
    [
      "network_unavailable",
      "Network unavailable. Check your connection and try again.",
    ],
    ["timeout", "The request timed out. Please try again."],
    ["auth_failed", "Authentication failed. Check your API key settings."],
    [
      "schema_violation",
      "The provider returned data that does not match the expected schema.",
    ],
    [
      "invalid_response",
      "The provider response could not be parsed. Please retry.",
    ],
  ] as const)("maps %s to vetted user copy", (code, expected) => {
    const message = getUserFacingErrorMessage(
      new AppError(code, "raw provider detail"),
      "fallback",
    );

    expect(message).toBe(expected);
  });

  test("falls back for unknown errors", () => {
    const message = getUserFacingErrorMessage(new Error("x"), "fallback");

    expect(message).toBe("fallback");
  });

  test("does not trust plain objects with app error codes", () => {
    const message = getUserFacingErrorMessage(
      { code: "permission_denied" },
      "fallback",
    );

    expect(message).toBe("fallback");
  });

  test("falls back for unknown app error codes", () => {
    const error = new AppError("network_unavailable", "x") as unknown as {
      code: string;
    };
    error.code = "unexpected_provider_code";

    expect(getUserFacingErrorMessage(error, "fallback")).toBe("fallback");
  });
});
