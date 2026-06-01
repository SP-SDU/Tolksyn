import type { SubmissionPayload } from "../services/submission-service";

/** Pretty printing helps operators diff exports, and ingest still receives compact JSON on send. */
export function serializeJson(payload: SubmissionPayload): string {
  return JSON.stringify(payload, null, 2);
}
