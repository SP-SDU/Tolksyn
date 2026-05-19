import { createGitHubCopilotProxy } from 'github-copilot-oauth/proxy';

export async function GET(request: Request): Promise<Response> {
  return createGitHubCopilotProxy({ fetch }).models(request);
}
