import { createRemoteExtractor } from '@/api/remote-extractor';
import { emptyStructuredItem } from '@/types/item-schema';

describe('remote extractor', () => {
  test('rejects unsupported provider IDs with actionable error', async () => {
    const extractor = createRemoteExtractor({
      getSettings: async () => ({
        provider: {
          id: 'openrouter',
          endpointUrl: 'https://openrouter.ai/api/v1/chat/completions',
          model: 'openai/gpt-4.1-mini',
          timeoutMs: 6000,
          authModeByProvider: {
            openrouter: 'api',
          },
          auth: {},
        },
        ingest: {
          endpointUrl: 'https://example.com/ingest',
          apiKey: 'ingest-key',
        },
        barcode: {
          enabled: true,
          allowedTypes: ['ean13'],
        },
      }),
      providerCatalog: {
        supportsImage: async () => false,
      },
    } as any);

    await expect(
      extractor.extract({
        imageUri: 'file://img.jpg',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        width: 1200,
        height: 800,
      }),
    ).rejects.toMatchObject({
      code: 'unsupported',
      message: expect.stringContaining('does not support image input'),
    });
  });

  test('requires auth for supported API-key provider', async () => {
    const extractor = createRemoteExtractor({
      getSettings: async () => ({
        provider: {
          id: 'google',
          endpointUrl:
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
          model: 'gemini-2.0-flash',
          timeoutMs: 6000,
          authModeByProvider: {
            google: 'api',
          },
          auth: {
            google: {
              type: 'api',
              key: '',
            },
          },
        },
        ingest: {
          endpointUrl: 'https://example.com/ingest',
          apiKey: 'ingest-key',
        },
        barcode: {
          enabled: true,
          allowedTypes: ['ean13'],
        },
      }),
      providerCatalog: {
        supportsImage: async () => true,
      },
    } as any);

    await expect(
      extractor.extract({
        imageUri: 'file://img.jpg',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        width: 1200,
        height: 800,
      }),
    ).rejects.toMatchObject({
      code: 'auth_failed',
    });
  });

  test('uses OpenAI OAuth access token when provider auth mode is oauth', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                structured_json: emptyStructuredItem(),
              }),
            },
          },
        ],
      }),
    } as any);

    const extractor = createRemoteExtractor({
      getSettings: async () => ({
        provider: {
          id: 'openai',
          endpointUrl: 'https://api.openai.com/v1/chat/completions',
          model: 'gpt-4.1-mini',
          modelVariant: null,
          timeoutMs: 6000,
          authModeByProvider: {
            openai: 'oauth',
          },
          auth: {
            openai: {
              type: 'oauth',
              refresh: 'refresh-token',
              access: 'oauth-access-token',
              expires: Date.now() + 60_000,
            },
          },
        },
        ingest: {
          endpointUrl: 'https://example.com/ingest',
          apiKey: 'ingest-key',
        },
        barcode: {
          enabled: true,
          allowedTypes: ['ean13'],
        },
      }),
      providerCatalog: {
        supportsImage: async () => true,
      },
    } as any);

    await extractor.extract({
      imageUri: 'file://img.jpg',
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
      width: 1200,
      height: 800,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer oauth-access-token',
        }),
      }),
    );

    fetchMock.mockRestore();
  });

  test('uses GitHub Copilot OAuth token exchange then calls chat completions for gpt-4 models', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: 'copilot-access',
          expires_at: 1_900_000_000,
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    structured_json: emptyStructuredItem(),
                  }),
                },
              },
            ],
          }),
      } as any);

    const extractor = createRemoteExtractor({
      getSettings: async () => ({
        provider: {
          id: 'github-copilot',
          endpointUrl: 'https://api.githubcopilot.com/chat/completions',
          model: 'gpt-4.1',
          modelVariant: null,
          timeoutMs: 6000,
          authModeByProvider: {
            'github-copilot': 'oauth',
          },
          auth: {
            'github-copilot': {
              type: 'oauth',
              refresh: 'copilot-token',
              access: 'copilot-token',
              expires: 0,
            },
          },
        },
        ingest: {
          endpointUrl: 'https://example.com/ingest',
          apiKey: 'ingest-key',
        },
        barcode: {
          enabled: true,
          allowedTypes: ['ean13'],
        },
      }),
    } as any);

    await extractor.extract({
      imageUri: 'file://img.jpg',
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
      width: 1200,
      height: 800,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.github.com/copilot_internal/v2/token',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer copilot-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.githubcopilot.com/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer copilot-access',
        }),
      }),
    );

    fetchMock.mockRestore();
  });

  test('uses GitHub Copilot responses endpoint for gpt-5 models', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: 'copilot-access',
          expires_at: 1_900_000_000,
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            output_text: JSON.stringify({
              structured_json: emptyStructuredItem(),
            }),
          }),
      } as any);

    const extractor = createRemoteExtractor({
      getSettings: async () => ({
        provider: {
          id: 'github-copilot',
          endpointUrl: 'https://api.githubcopilot.com/chat/completions',
          model: 'gpt-5.4',
          modelVariant: null,
          timeoutMs: 6000,
          authModeByProvider: {
            'github-copilot': 'oauth',
          },
          auth: {
            'github-copilot': {
              type: 'oauth',
              refresh: 'copilot-token',
              access: 'copilot-token',
              expires: 0,
            },
          },
        },
        ingest: {
          endpointUrl: 'https://example.com/ingest',
          apiKey: 'ingest-key',
        },
        barcode: {
          enabled: true,
          allowedTypes: ['ean13'],
        },
      }),
    } as any);

    await extractor.extract({
      imageUri: 'file://img.jpg',
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
      width: 1200,
      height: 800,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.githubcopilot.com/responses',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    fetchMock.mockRestore();
  });

  test('uses codex endpoint with OpenAI OAuth account headers', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        [
          'data: {"type":"response.output_text.delta","delta":"{\\"structured_json\\":"}',
          'data: {"type":"response.output_text.delta","delta":"{}"}',
          'data: {"type":"response.output_text.delta","delta":"}"}',
          'data: [DONE]',
        ].join('\n'),
    } as any);

    const extractor = createRemoteExtractor({
      getSettings: async () => ({
        provider: {
          id: 'openai',
          endpointUrl: 'https://chatgpt.com/backend-api/codex/responses',
          model: 'gpt-5.3-codex',
          modelVariant: null,
          timeoutMs: 6000,
          authModeByProvider: {
            openai: 'oauth',
          },
          auth: {
            openai: {
              type: 'oauth',
              refresh: 'refresh-token',
              access: 'oauth-access-token',
              expires: Date.now() + 60_000,
              accountId: 'acct_123',
            },
          },
        },
        ingest: {
          endpointUrl: 'https://example.com/ingest',
          apiKey: 'ingest-key',
        },
        barcode: {
          enabled: true,
          allowedTypes: ['ean13'],
        },
      }),
      providerCatalog: {
        supportsImage: async () => true,
      },
    } as any);

    await extractor.extract({
      imageUri: 'file://img.jpg',
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
      width: 1200,
      height: 800,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/codex/responses',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer oauth-access-token',
          'ChatGPT-Account-Id': 'acct_123',
        }),
      }),
    );

    fetchMock.mockRestore();
  });

  test('falls back to null structured fields after retryable parse failures', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'data: {"type":"response.output_text.delta","delta":"not-json"}\ndata: [DONE]',
      } as any);

    const extractor = createRemoteExtractor({
      getSettings: async () => ({
        provider: {
          id: 'openai',
          endpointUrl: 'https://chatgpt.com/backend-api/codex/responses',
          model: 'gpt-5.4',
          modelVariant: null,
          timeoutMs: 6000,
          authModeByProvider: {
            openai: 'oauth',
          },
          auth: {
            openai: {
              type: 'oauth',
              refresh: 'refresh-token',
              access: 'oauth-access-token',
              expires: Date.now() + 60_000,
              accountId: 'acct_123',
            },
          },
        },
        ingest: {
          endpointUrl: 'https://example.com/ingest',
          apiKey: 'ingest-key',
        },
        barcode: {
          enabled: true,
          allowedTypes: ['ean13'],
        },
      }),
      providerCatalog: {
        supportsImage: async () => true,
      },
    } as any);

    const result = await extractor.extract({
      imageUri: 'file://img.jpg',
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
      width: 1200,
      height: 800,
    });

    expect(result.structuredJson).toEqual(emptyStructuredItem());
    expect(result.extractionDiagnostics?.failed).toBe(true);
    expect(result.extractionDiagnostics?.attempts).toHaveLength(3);

    fetchMock.mockRestore();
  });
});
