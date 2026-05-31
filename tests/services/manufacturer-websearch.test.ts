import { createManufacturerWebSearchEnricher } from '@/services/manufacturer-websearch';
import { defaultSettings } from '@/types/settings';
import { emptyStructuredItem } from '@/types/item-schema';

describe('manufacturer websearch enrichment', () => {
  test('plans queries, passes them to agent-query-crawl, and reconciles crawled pages', async () => {
    const settings = defaultSettings();
    settings.webSearch.enabled = true;
    const extractor = {
      extract: jest
        .fn()
        .mockResolvedValueOnce({
          structuredJson: { ...emptyStructuredItem(), productNumber: '2865463' },
          barcodes: [],
          responseText: JSON.stringify({ queries: ['Phoenix Contact 2865463 official datasheet'] }),
          metadata: { provider: 'remote_ai_sdk', durationMs: 1, imageWidth: 1, imageHeight: 1 },
        })
        .mockResolvedValueOnce({
          structuredJson: { ...emptyStructuredItem(), manufacturer: 'Phoenix Contact', productNumber: '2865463' },
          barcodes: [],
          auxiliaryText: JSON.stringify({
            fieldChanges: [
              {
                field: 'manufacturer',
                before: null,
                after: 'Phoenix Contact',
                evidenceUrls: ['https://example.com/product'],
                reason: 'Official product page identifies the manufacturer.',
              },
            ],
            conflicts: [],
          }),
          metadata: { provider: 'remote_ai_sdk', durationMs: 1, imageWidth: 1, imageHeight: 1 },
        }),
    };
    const queryCrawl = {
      query: jest.fn().mockResolvedValue({
        query: 'Phoenix Contact 2865463 official datasheet',
        resultsText: 'Official product page https://example.com/product',
        urls: ['https://example.com/product'],
        sources: [
          {
            url: 'https://example.com/product',
            contentType: 'text/html',
            text: 'Phoenix Contact official product page for 2865463',
          },
        ],
      }),
    };
    const enricher = createManufacturerWebSearchEnricher({
      settings: { getSettings: async () => settings },
      extractor,
      queryCrawl,
    });

    const result = await enricher.enrich({
      images: [{
        imageUri: 'file://image.jpg',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        width: 100,
        height: 100,
      }],
      structuredJson: { ...emptyStructuredItem(), productNumber: '2865463' },
      barcodes: [],
    });

    expect(queryCrawl.query).toHaveBeenCalledWith(expect.objectContaining({
      query: 'Phoenix Contact 2865463 official datasheet',
      crawl: expect.objectContaining({ enabled: true, maxPages: 6 }),
    }));
    expect(extractor.extract).toHaveBeenLastCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('Phoenix Contact official product page for 2865463'),
    }));
    expect(result?.structuredJson.manufacturer).toBe('Phoenix Contact');
    expect(result?.diagnostics).toEqual(expect.objectContaining({
      queries: ['Phoenix Contact 2865463 official datasheet'],
      attempts: [
        expect.objectContaining({ type: 'query_planning', status: 'success' }),
        expect.objectContaining({ type: 'exa_search', status: 'success', query: 'Phoenix Contact 2865463 official datasheet' }),
        expect.objectContaining({ type: 'webfetch', status: 'success', url: 'https://example.com/product' }),
        expect.objectContaining({ type: 'reconciliation', status: 'success' }),
      ],
      sources: [expect.objectContaining({ url: 'https://example.com/product' })],
      fieldChanges: [
        {
          field: 'manufacturer',
          before: null,
          after: 'Phoenix Contact',
          evidenceUrls: ['https://example.com/product'],
          reason: 'Official product page identifies the manufacturer.',
        },
      ],
    }));
  });

  test('accepts query json from extraction envelope auxiliary text', async () => {
    const settings = defaultSettings();
    settings.webSearch.enabled = true;
    const extractor = {
      extract: jest
        .fn()
        .mockResolvedValueOnce({
          structuredJson: emptyStructuredItem(),
          barcodes: [],
          responseText: JSON.stringify({
            structured_json: emptyStructuredItem(),
            auxiliary_text_optional: JSON.stringify({ queries: ['Siemens 3RW4027-2BB04 official datasheet'] }),
          }),
          metadata: { provider: 'remote_ai_sdk', durationMs: 1, imageWidth: 1, imageHeight: 1 },
        })
        .mockResolvedValueOnce({
          structuredJson: emptyStructuredItem(),
          barcodes: [],
          auxiliaryText: JSON.stringify({ fieldChanges: [], conflicts: [] }),
          metadata: { provider: 'remote_ai_sdk', durationMs: 1, imageWidth: 1, imageHeight: 1 },
        }),
    };
    const queryCrawl = {
      query: jest.fn().mockResolvedValue({
        query: 'Siemens 3RW4027-2BB04 official datasheet',
        resultsText: 'https://example.com/siemens',
        urls: ['https://example.com/siemens'],
        sources: [{ url: 'https://example.com/siemens', contentType: 'text/html', text: 'Siemens datasheet' }],
      }),
    };
    const enricher = createManufacturerWebSearchEnricher({
      settings: { getSettings: async () => settings },
      extractor,
      queryCrawl,
    });

    const result = await enricher.enrich({
      images: [{
        imageUri: 'file://image.jpg',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        width: 100,
        height: 100,
      }],
      structuredJson: emptyStructuredItem(),
      barcodes: [],
    });

    expect(queryCrawl.query).toHaveBeenCalledWith(expect.objectContaining({ query: 'Siemens 3RW4027-2BB04 official datasheet' }));
    expect(result?.diagnostics.queries).toEqual(['Siemens 3RW4027-2BB04 official datasheet']);
  });

  test('skips websearch explicitly when query planning returns no direct query json', async () => {
    const settings = defaultSettings();
    settings.webSearch.enabled = true;
    const extractor = {
      extract: jest.fn().mockResolvedValue({
        structuredJson: { ...emptyStructuredItem(), manufacturer: 'Siemens' },
        barcodes: [],
        responseText: '{"structured_json":{},"auxiliary_text_optional":null}',
        metadata: { provider: 'remote_ai_sdk', durationMs: 1, imageWidth: 1, imageHeight: 1 },
      }),
    };
    const queryCrawl = { query: jest.fn() };
    const enricher = createManufacturerWebSearchEnricher({
      settings: { getSettings: async () => settings },
      extractor,
      queryCrawl,
    });

    const result = await enricher.enrich({
      images: [{
        imageUri: 'file://image.jpg',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        width: 100,
        height: 100,
      }],
      structuredJson: { ...emptyStructuredItem(), manufacturer: 'Siemens' },
      barcodes: [],
    });

    expect(queryCrawl.query).not.toHaveBeenCalled();
    expect(result?.structuredJson.manufacturer).toBe('Siemens');
    expect(result?.diagnostics).toEqual(expect.objectContaining({
      skipped: true,
      skipReason: 'Query planner returned no queries.',
      attempts: [expect.objectContaining({ type: 'query_planning', status: 'failed' })],
    }));
  });

  test('uses one shared total crawl-page limit across planned queries', async () => {
    const settings = defaultSettings();
    settings.webSearch.enabled = true;
    const extractor = {
      extract: jest
        .fn()
        .mockResolvedValueOnce({
          structuredJson: emptyStructuredItem(),
          barcodes: [],
          responseText: JSON.stringify({ queries: ['q1', 'q2', 'q3', 'q4'] }),
          metadata: { provider: 'remote_ai_sdk', durationMs: 1, imageWidth: 1, imageHeight: 1 },
        })
        .mockResolvedValueOnce({
          structuredJson: emptyStructuredItem(),
          barcodes: [],
          auxiliaryText: JSON.stringify({ fieldChanges: [], conflicts: [] }),
          metadata: { provider: 'remote_ai_sdk', durationMs: 1, imageWidth: 1, imageHeight: 1 },
        }),
    };
    const queryCrawl = {
      query: jest.fn((input: { query: string; crawl?: { maxPages?: number } }) => Promise.resolve({
        query: input.query,
        resultsText: `${input.query} https://example.com/${input.query}`,
        urls: [`https://example.com/${input.query}`],
        sources: Array.from({ length: input.crawl?.maxPages ?? 0 }, (_, index) => ({
          url: `https://example.com/${input.query}-${index}`,
          contentType: 'text/html',
          text: `${input.query}-${index}`,
        })),
      })),
    };
    const enricher = createManufacturerWebSearchEnricher({
      settings: { getSettings: async () => settings },
      extractor,
      queryCrawl,
    });

    await enricher.enrich({
      images: [{
        imageUri: 'file://image.jpg',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        width: 100,
        height: 100,
      }],
      structuredJson: emptyStructuredItem(),
      barcodes: [],
    });

    expect(queryCrawl.query).toHaveBeenCalledTimes(3);
    expect(queryCrawl.query).toHaveBeenNthCalledWith(1, expect.objectContaining({ crawl: expect.objectContaining({ maxPages: 6 }) }));
    expect(queryCrawl.query).toHaveBeenNthCalledWith(2, expect.objectContaining({ crawl: expect.objectContaining({ enabled: false, maxPages: 0 }) }));
    expect(queryCrawl.query).toHaveBeenNthCalledWith(3, expect.objectContaining({ crawl: expect.objectContaining({ enabled: false, maxPages: 0 }) }));
  });
});
