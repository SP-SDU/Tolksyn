import {
  AppError,
  getErrorMessage,
  providerHttpStatusToError,
} from "@/types/app-error";

describe("getErrorMessage", () => {
  test("names app errors for diagnostics", () => {
    expect(new AppError("internal", "x").name).toBe("AppError");
  });

  test("returns app error message verbatim", () => {
    const message = getErrorMessage(
      new AppError("rate_limited", "Provider said no quota"),
      "fallback",
    );

    // Structured error codes carry user-meaningful messages that must be surfaced
    expect(message).toBe("Provider said no quota");
  });

  test("returns generic error message verbatim", () => {
    const message = getErrorMessage(
      new Error("Socket closed by provider"),
      "fallback",
    );

    // Plain Error messages are preserved so debugging is not degraded
    expect(message).toBe("Socket closed by provider");
  });

  test("falls back when no message is available", () => {
    const message = getErrorMessage({ nope: true }, "fallback");

    // Non-error objects cannot produce a message. Fallback protects the UI
    expect(message).toBe("fallback");
  });

  test.each([
    new AppError("internal", " "),
    new Error(" "),
  ])("falls back for blank error message %#", (error) => {
    expect(getErrorMessage(error, "fallback")).toBe("fallback");
  });
});

describe("providerHttpStatusToError", () => {
  test("maps quota-like 403 payload to rate_limited with provider message", async () => {
    const error = await providerHttpStatusToError({
      status: 403,
      text: async () =>
        JSON.stringify({
          error: {
            message:
              "You exceeded your current quota, please check your plan and billing details.",
          },
        }),
    } as Response);

    // 403 with quota wording maps to rate_limited so the UI can show upgrade guidance
    expect(error).toMatchObject({
      code: "rate_limited",
      message: expect.stringContaining("quota"),
    } satisfies Partial<AppError>);
  });

  test.each([
    [429, "rate_limited"],
    [402, "invalid_response"],
    [401, "auth_failed"],
    [400, "invalid_response"],
  ] as const)("maps HTTP %i responses", async (status, code) => {
    const error = await providerHttpStatusToError(response(status, "provider detail"));

    expect(error).toMatchObject({
      code,
      message: "provider detail",
    } satisfies Partial<AppError>);
  });

  test.each([
    ["resource_exhausted"],
    ["insufficient_quota"],
    ["too many requests"],
    ["rate limit"],
    ["billing"],
  ])("maps quota-like 403 detail %s to rate_limited", async (detail) => {
    const error = await providerHttpStatusToError(response(403, detail));

    expect(error.code).toBe("rate_limited");
  });

  test("does not treat quota wording on non-403 statuses as rate limited", async () => {
    const error = await providerHttpStatusToError(
      response(402, "insufficient_quota"),
    );

    expect(error.code).toBe("invalid_response");
  });

  test("maps auth-like 403 payload to auth_failed with provider message", async () => {
    const error = await providerHttpStatusToError({
      status: 403,
      text: async () =>
        JSON.stringify({
          error: {
            message: "Model not available for your account",
          },
        }),
    } as Response);

    // 403 without quota wording maps to auth_failed
    expect(error).toMatchObject({
      code: "auth_failed",
      message: "Model not available for your account",
    } satisfies Partial<AppError>);
  });

  test("maps 500 responses to network_unavailable", async () => {
    const error = await providerHttpStatusToError({
      status: 500,
      text: async () => "upstream server error",
    } as Response);

    // Server errors are transient. Map to retryable network_unavailable
    expect(error).toMatchObject({
      code: "network_unavailable",
      message: "upstream server error",
    } satisfies Partial<AppError>);
  });

  test.each([
    [JSON.stringify({ message: "direct message" }), "direct message"],
    [JSON.stringify({ message: " direct message " }), "direct message"],
    [
      JSON.stringify({ error_description: "description message" }),
      "description message",
    ],
    [
      JSON.stringify({ error_description: " description message " }),
      "description message",
    ],
    [JSON.stringify({ detail: "detail message" }), "detail message"],
    [JSON.stringify({ detail: " detail message " }), "detail message"],
    [JSON.stringify({ error: "nested string" }), "nested string"],
    [JSON.stringify({ error: " nested string " }), "nested string"],
    [JSON.stringify({ error: { detail: "nested detail" } }), "nested detail"],
    [JSON.stringify("json string message"), "json string message"],
    [JSON.stringify(" json string message "), "json string message"],
  ] as const)("extracts provider error message from %s", async (body, expected) => {
    const error = await providerHttpStatusToError(response(400, body));

    expect(error.message).toBe(expected);
  });

  test.each([
    JSON.stringify({ other: true }),
    JSON.stringify({ message: " ", error_description: " ", detail: " " }),
    JSON.stringify(null),
    JSON.stringify(123),
  ])("keeps raw body when provider JSON has no usable message %#", async (body) => {
    const error = await providerHttpStatusToError(response(400, body));

    expect(error.message).toBe(body);
  });

  test("trims non-JSON provider bodies", async () => {
    const error = await providerHttpStatusToError(response(400, " provider detail "));

    expect(error.message).toBe("provider detail");
  });

  test("falls back to status message for empty response body", async () => {
    const error = await providerHttpStatusToError(response(400, " "));

    expect(error).toMatchObject({
      code: "invalid_response",
      message: "Provider request failed with status 400.",
    } satisfies Partial<AppError>);
  });

  test("falls back to status message when response body cannot be read", async () => {
    const error = await providerHttpStatusToError({
      status: 400,
      text: async () => {
        throw new Error("body unavailable");
      },
    } as unknown as Response);

    expect(error.message).toBe("Provider request failed with status 400.");
  });

  test("truncates long provider messages", async () => {
    const long = "x".repeat(401);
    const error = await providerHttpStatusToError(response(400, long));

    expect(error.message).toBe("x".repeat(400));
  });
});

function response(status: number, body: string): Response {
  return {
    status,
    text: async () => body,
  } as Response;
}
