/** Re-submitting the same accepted revision must not create duplicate inventory rows downstream. */
export async function buildIdempotencyKey(
  attemptId: string,
  acceptedRevision: number,
): Promise<string> {
  return `tolksyn:${attemptId}:${acceptedRevision}`;
}
