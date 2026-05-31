import { POST as chatPost } from "@/app/api/proxy/github-copilot/chat/completions+api";
import { GET as modelsGet } from "@/app/api/proxy/github-copilot/models+api";
import { POST as responsesPost } from "@/app/api/proxy/github-copilot/responses+api";

describe("github copilot proxy api routes", () => {
  test("forwards models request via token exchange", async () => {
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

    const response = await modelsGet(
      new Request("http://localhost:8081/api/proxy/github-copilot/models", {
        headers: {
          authorization: "Bearer refresh-token",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("data");
    expect(mock).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/copilot_internal/v2/token",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer refresh-token",
        }),
      }),
    );
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
