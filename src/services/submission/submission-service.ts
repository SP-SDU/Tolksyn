import { AppError, type AppErrorCode } from "@/types/app-error";
import type { QueueSubmissionResult } from "@/types/queue";
import type { SubmissionPayload } from "@/types/submission";

export function createSubmissionService({
  attempts,
  queue,
  transport,
  network,
  createIdempotencyKey,
  now,
}: {
  attempts: {
    markSent(attemptId: string): Promise<void> | void;
    markQueued(
      attemptId: string,
      acceptedRevision: number,
    ): Promise<void> | void;
    markFailed(attemptId: string, errorCode: string): Promise<void> | void;
  };
  queue: {
    enqueue(input: {
      id: string;
      attemptId: string;
      acceptedRevision: number;
      idempotencyKey: string;
      payload: SubmissionPayload;
      enqueuedAt: number;
    }): Promise<unknown> | unknown;
  };
  transport: {
    submit(input: {
      attemptId: string;
      acceptedRevision: number;
      idempotencyKey: string;
      payload: SubmissionPayload;
    }): Promise<QueueSubmissionResult>;
  };
  network: {
    isOnline(): Promise<boolean>;
  };
  createIdempotencyKey(
    attemptId: string,
    acceptedRevision: number,
  ): Promise<string>;
  now(): number;
}) {
  return {
    async acceptAttempt({
      attemptId,
      acceptedRevision,
      payload,
    }: {
      attemptId: string;
      acceptedRevision: number;
      payload: SubmissionPayload;
    }): Promise<{ outcome: "sent" | "queued"; idempotencyKey: string }> {
      const idempotencyKey = await createIdempotencyKey(
        attemptId,
        acceptedRevision,
      );

      if (!(await network.isOnline())) {
        await enqueueAttempt({
          attemptId,
          acceptedRevision,
          payload,
          idempotencyKey,
        });
        return { outcome: "queued", idempotencyKey };
      }

      const result = await transport.submit({
        attemptId,
        acceptedRevision,
        idempotencyKey,
        payload,
      });

      if (result.kind === "success") {
        await attempts.markSent(attemptId);
        return { outcome: "sent", idempotencyKey };
      }

      if (result.kind === "retryable_error") {
        // Transient ingest failures join the offline queue instead of blocking confirm UX.
        await enqueueAttempt({
          attemptId,
          acceptedRevision,
          payload,
          idempotencyKey,
        });
        return { outcome: "queued", idempotencyKey };
      }

      await attempts.markFailed(attemptId, result.errorCode);
      throw new AppError(
        result.errorCode,
        submissionErrorMessage(result.errorCode),
      );
    },
  };

  async function enqueueAttempt({
    attemptId,
    acceptedRevision,
    payload,
    idempotencyKey,
  }: {
    attemptId: string;
    acceptedRevision: number;
    payload: SubmissionPayload;
    idempotencyKey: string;
  }): Promise<void> {
    const enqueuedAt = now();
    await queue.enqueue({
      id: `${attemptId}:${acceptedRevision}`,
      attemptId,
      acceptedRevision,
      idempotencyKey,
      payload,
      enqueuedAt,
    });
    await attempts.markQueued(attemptId, acceptedRevision);
  }
}

function submissionErrorMessage(code: AppErrorCode): string {
  if (code === "auth_failed") {
    return "Submission authentication failed. Check the ingest API key in Settings.";
  }

  if (code === "invalid_response") {
    return "Submission was rejected by the ingest endpoint.";
  }

  if (code === "unsupported") {
    return "Submission is not supported by the configured ingest endpoint.";
  }

  return "Unable to submit this attempt.";
}
