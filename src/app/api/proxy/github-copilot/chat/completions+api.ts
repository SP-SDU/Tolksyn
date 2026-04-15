import { proxyCopilotPost } from '@/app/api/proxy/github-copilot/shared';

export async function POST(request: Request): Promise<Response> {
  return proxyCopilotPost(request, 'chat/completions');
}
