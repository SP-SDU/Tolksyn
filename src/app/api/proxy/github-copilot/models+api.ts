import { proxyCopilotModels } from '@/app/api/proxy/github-copilot/shared';

export async function GET(request: Request): Promise<Response> {
  return proxyCopilotModels(request);
}
