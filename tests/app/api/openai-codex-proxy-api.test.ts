import { POST } from "@/app/api/proxy/openai/codex/responses+api";

describe("openai codex proxy api route", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("proxies codex responses requests through the package proxy", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const response = await POST(
      new Request("http://localhost:8081/api/proxy/openai/codex/responses", {
        method: "POST",
        headers: {
          authorization: "Bearer oauth-access-token",
          "ChatGPT-Account-Id": "acct_123",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5.3-codex",
          max_output_tokens: 100,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe('{"ok":true}');
    expect(global.fetch).toHaveBeenCalledWith(
      "https://chatgpt.com/backend-api/codex/responses",
      expect.objectContaining({ method: "POST" }),
    );
    const headers = new Headers(
      jest.mocked(global.fetch).mock.calls[0]?.[1]?.headers,
    );
    expect(headers.get("authorization")).toBe("Bearer oauth-access-token");
    expect(headers.get("chatgpt-account-id")).toBe("acct_123");
    expect(headers.get("originator")).toBe("tolksyn");
    expect(
      JSON.parse(String(jest.mocked(global.fetch).mock.calls[0]?.[1]?.body)),
    ).toEqual({
      model: "gpt-5.3-codex",
      instructions: "",
      store: false,
    });
  });
});
