import { createAgentQueryCrawlProxy } from 'agent-query-crawl/proxy';

export async function GET(request: Request): Promise<Response> {
  return createAgentQueryCrawlProxy({ fetch }).webFetch(request);
}
