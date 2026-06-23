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
