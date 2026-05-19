import { createOpenAIOAuthProxy } from 'openai-codex-oauth/proxy';

export async function POST(request: Request): Promise<Response> {
  return createOpenAIOAuthProxy({ fetch, originator: 'tolksyn' }).responses(request);
}
