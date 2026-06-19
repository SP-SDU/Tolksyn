import { GET } from "@/app/api/proxy/webfetch+api";

describe("webfetch proxy api route", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("forwards http url fetches with browser-like headers", async () => {
    // Mock upstream response with HTML containing script tags
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        "<html><body><h1>Product page</h1><script>x()</script></body></html>",
        {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        },
      ),
    );

    // Proxy GET request with target URL as query param
    const response = await GET(
      new Request(
        "http://localhost:8081/api/proxy/webfetch?url=https%3A%2F%2Fexample.com%2Fproduct",
      ),
    );

    // Script tags stripped to prevent XSS in SSR context
    expect(response.status).toBe(200);
    // Content-Type overridden to text/plain so SSR does not parse as HTML
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(await response.text()).toBe("Product page");
    // redirect: "error" prevents following redirects (SSRF protection)
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/product",
      expect.objectContaining({
        method: "GET",
        redirect: "error",
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          Accept: expect.stringContaining("text/html"),
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": expect.stringContaining("Mozilla/5.0"),
        }),
      }),
    );
  });

  test("rejects oversized upstream responses", async () => {
    // 5MB plus 1 body triggers the size boundary check
    const body = "x".repeat(5 * 1024 * 1024 + 1);
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "Content-Length": String(5 * 1024 * 1024 + 1) },
      }),
    );

    // Proxy request for a huge page
    const response = await GET(
      new Request(
        "http://localhost:8081/api/proxy/webfetch?url=https%3A%2F%2Fexample.com%2Fhuge",
      ),
    );

    // Proxy returns 413 Payload Too Large instead of proxying the body
    expect(response.status).toBe(413);
    expect(await response.text()).toBe("Response too large");
  });

  test("returns a gateway error when upstream fetch fails", async () => {
    // Upstream throws (simulating redirect: "error" rejection upstream)
    jest
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("redirect blocked"));

    // Proxy request to a URL that causes failure
    const response = await GET(
      new Request(
        "http://localhost:8081/api/proxy/webfetch?url=https%3A%2F%2Fexample.com%2Fredirect",
      ),
    );

    // 502 Bad Gateway returned, not leaked error detail
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Upstream request failed");
  });

  test("rejects missing or unsafe urls", async () => {
    // Suppress expected validation warnings for clean test output
    jest.spyOn(console, "warn").mockImplementation(() => {});

    // Each case tests a different URL validation rule
    await expect(
      GET(new Request("http://localhost:8081/api/proxy/webfetch")),
    ).resolves.toMatchObject({ status: 400 });
    // file:// URLs are blocked to prevent local file disclosure
    await expect(
      GET(
        new Request(
          "http://localhost:8081/api/proxy/webfetch?url=file%3A%2F%2F%2Fetc%2Fpasswd",
        ),
      ),
    ).resolves.toMatchObject({ status: 400 });
    // Plain http:// URLs are blocked, only https:// is allowed
    await expect(
      GET(
        new Request(
          "http://localhost:8081/api/proxy/webfetch?url=http%3A%2F%2Fexample.com%2Fproduct",
        ),
      ),
    ).resolves.toMatchObject({ status: 400 });
    // Private IP addresses (127.0.0.1) blocked to prevent SSRF
    await expect(
      GET(
        new Request(
          "http://localhost:8081/api/proxy/webfetch?url=https%3A%2F%2F127.0.0.1%2Fproduct",
        ),
      ),
    ).resolves.toMatchObject({ status: 400 });
  });
});
