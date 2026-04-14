export async function buildIdempotencyKey(attemptId: string, acceptedRevision: number): Promise<string> {
  return `tolksyn:${attemptId}:${acceptedRevision}`;
}
