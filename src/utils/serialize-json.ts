import type { SubmissionPayload } from '../services/submission-service';

/**
 * Serializes a SubmissionPayload into a pretty-printed JSON string.
 */
export function serializeJson(payload: SubmissionPayload): string {
  return JSON.stringify(payload, null, 2);
}
