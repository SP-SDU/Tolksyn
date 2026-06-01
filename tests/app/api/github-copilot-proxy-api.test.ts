import { POST as chatPost } from "@/app/api/proxy/github-copilot/chat/completions+api";
import { GET as modelsGet } from "@/app/api/proxy/github-copilot/models+api";
import { POST as responsesPost } from "@/app/api/proxy/github-copilot/responses+api";

describe("github copilot proxy api routes", () => {
  test("forwards models request via token exchange", async () => {
    // Arrange
    // Two upstream calls: token exchange then models API
    const mock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "copilot-access",
            expires_at: 1_900_000_000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    // Act
    // Models endpoint uses the original refresh token to exchange then list models
    const response = await modelsGet(
      new Request("http://localhost:8081/api/proxy/github-copilot/models", {
        headers: {
          authorization: "Bearer refresh-token",
        },
      }),
    );

    // Assert
    // Response includes model data
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("data");
    // First call: exchange refresh token for a Copilot access token
    expect(mock).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/copilot_internal/v2/token",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer refresh-token",
        }),
      }),
    );
    // Second call: models API uses the exchanged token, not the original
    expect(mock).toHaveBeenNthCalledWith(
      2,
      "https://api.githubcopilot.com/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer copilot-access",
        }),
      }),
    );

    mock.mockRestore();
  });

  test("forwards chat completions request with vision header", async () => {
    // Arrange
    // Token exchange then chat completions mock
    const mock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "copilot-access",
            expires_at: 1_900_000_000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '{"structured_json":{}}',
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    // Act
    // POST chat completion with base64-encoded JPEG (simulates camera capture)
    const response = await chatPost(
      new Request(
        "http://localhost:8081/api/proxy/github-copilot/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            authorization: "Bearer refresh-token",
          },
          body: JSON.stringify({
            model: "gpt-4.1",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "extract",
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: "data:image/jpeg;base64,abc",
                    },
                  },
                ],
              },
            ],
          }),
        },
      ),
    );

    // Assert
    // Vision-specific headers signal image content to upstream
    expect(response.status).toBe(200);
    expect(mock).toHaveBeenNthCalledWith(
      2,
      "https://api.githubcopilot.com/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer copilot-access",
          "Copilot-Vision-Request": "true",
          "Openai-Intent": "conversation-edits",
        }),
      }),
    );

    mock.mockRestore();
  });

  test("forwards responses request to responses endpoint", async () => {
    // Arrange
    // Token exchange then responses API mock
    const mock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "copilot-access",
            expires_at: 1_900_000_000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: '{"structured_json":{}}',
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    // Act
    // POST to /responses endpoint
    const response = await responsesPost(
      new Request("http://localhost:8081/api/proxy/github-copilot/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer refresh-token",
        },
        body: JSON.stringify({
          model: "gpt-5.4",
          input: [],
        }),
      }),
    );

    // Assert
    // Forwarded to the correct responses endpoint URL
    expect(response.status).toBe(200);
    expect(mock).toHaveBeenNthCalledWith(
      2,
      "https://api.githubcopilot.com/responses",
      expect.objectContaining({
        method: "POST",
      }),
    );

    mock.mockRestore();
  });
});
