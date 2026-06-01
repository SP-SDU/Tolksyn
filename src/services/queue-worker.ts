import type { AppErrorCode } from "@/types/app-error";

export type QueueItem = {
  id: string;
  sequence: number;
  status: "queued" | "sent" | "failed";
  nextAttemptAt: number;
  retryCount: number;
  payload: unknown;
  idempotencyKey: string;
  lastErrorCode?: string;
};

export type QueueSubmissionResult =
  | { kind: "success" }
  | { kind: "retryable_error"; errorCode: AppErrorCode }
  | { kind: "permanent_error"; errorCode: AppErrorCode };

export interface QueueRepository {
  peekReady(now: number): Promise<QueueItem | null>;
  markSent(id: string): Promise<void>;
  reschedule(
    id: string,
    nextAttemptAt: number,
    retryCount: number,
    errorCode: string,
  ): Promise<void>;
  markFailed(id: string, errorCode: string): Promise<void>;
}

export interface SubmissionTransport {
  submit(item: QueueItem): Promise<QueueSubmissionResult>;
}

/** One queue item per drain call so reschedule backoff is not immediately bypassed. */
export async function drainQueue({
  now,
  repository,
  transport,
  computeDelayMs,
}: {
  now: number;
  repository: QueueRepository;
  transport: SubmissionTransport;
  computeDelayMs: (retryCount: number) => number;
}): Promise<void> {
  while (true) {
    const next = await repository.peekReady(now);
    if (!next) {
      return;
    }

    const result = await transport.submit(next);

    if (result.kind === "success") {
      await repository.markSent(next.id);
      continue;
    }

    if (result.kind === "permanent_error") {
      await repository.markFailed(next.id, result.errorCode);
      continue;
    }

    const retryCount = next.retryCount + 1;
    const nextAttemptAt = now + computeDelayMs(retryCount);
    await repository.reschedule(
      next.id,
      nextAttemptAt,
      retryCount,
      result.errorCode,
    );
    return;
  }
}
