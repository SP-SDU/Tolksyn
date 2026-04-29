import { createExaWebSearch, extractUrlsFromText, parseExaSse } from '@/services/exa-websearch';

describe('exa websearch', () => {
  test('calls hosted Exa MCP web_search_exa with OpenCode defaults', async () => {
    const fetch = jest.fn().mockResolvedValue(
      new Response('data: {"result":{"content":[{"type":"text","text":"Phoenix Contact result"}]}}\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const webSearch = createExaWebSearch({ fetch: fetch as unknown as typeof global.fetch });

    const output = await webSearch.search({ query: 'Phoenix Contact 2865463 manufacturer' });

    expect(output).toBe('Phoenix Contact result');
    expect(fetch).toHaveBeenCalledWith(
      'https://mcp.exa.ai/mcp',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const [, options] = fetch.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(options.body)).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'web_search_exa',
        arguments: {
          query: 'Phoenix Contact 2865463 manufacturer',
          type: 'auto',
          numResults: 8,
          livecrawl: 'fallback',
        },
      },
    });
  });

  test('parses first Exa SSE text content', () => {
    expect(parseExaSse('event: message\ndata: {"result":{"content":[{"type":"text","text":"First"}]}}\n')).toBe('First');
  });

  test('extracts unique http urls from Exa output', () => {
    expect(
      extractUrlsFromText('Official: https://example.com/product. Datasheet https://example.com/ds.pdf and https://example.com/product'),
    ).toEqual(['https://example.com/product', 'https://example.com/ds.pdf']);
  });
});
