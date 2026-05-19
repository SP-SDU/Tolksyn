import { createGitHubCopilotProxy } from 'github-copilot-oauth/proxy';

export async function POST(request: Request): Promise<Response> {
  return createGitHubCopilotProxy({ fetch }).deviceCode(request);
}
