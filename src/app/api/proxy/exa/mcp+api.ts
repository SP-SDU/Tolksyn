import { createAgentQueryCrawlProxy } from "agent-query-crawl/proxy";

export async function POST(request: Request): Promise<Response> {
  return createAgentQueryCrawlProxy({ fetch }).exaMcp(request);
}
