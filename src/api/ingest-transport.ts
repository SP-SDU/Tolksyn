import type { QueueItem, QueueSubmissionResult } from '@/services/queue-worker';
import { AppError } from '@/types/app-error';
import type { AppSettings } from '@/types/settings';
import { isRetryableHttpStatus } from '@/utils/retry-policy';
import { RuntimeLimits } from '@/constants/runtime';

export function createIngestTransport(settingsRepository: {
  getSettings(): Promise<AppSettings>;
}) {
  return {
    async submit({
      idempotencyKey,
      payload,
    }: Pick<QueueItem, 'idempotencyKey' | 'payload'> & {
      idempotencyKey: string;
      payload: unknown;
    }): Promise<QueueSubmissionResult> {
      try {
        const settings = await settingsRepository.getSettings();
        if (!settings.ingest.endpointUrl.trim()) {
          return { kind: 'permanent_error', errorCode: 'invalid_response' };
        }

        if (!settings.ingest.apiKey.trim()) {
          return { kind: 'permanent_error', errorCode: 'auth_failed' };
        }

        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), RuntimeLimits.ingestTimeoutMs);
        let response: Response;
        try {
          response = await fetch(settings.ingest.endpointUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
              'x-api-key': settings.ingest.apiKey,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutHandle);
        }

        if (response.ok) {
          return { kind: 'success' };
        }

        if (isRetryableHttpStatus(response.status)) {
          return { kind: 'retryable_error', errorCode: mapRetryableStatus(response.status) };
        }

        return { kind: 'permanent_error', errorCode: mapPermanentStatus(response.status) };
      } catch (error) {
        if (error instanceof AppError) {
          return { kind: 'permanent_error', errorCode: error.code };
        }

        if (
          (error instanceof Error && error.name === 'AbortError') ||
          (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
        ) {
          return { kind: 'retryable_error', errorCode: 'timeout' };
        }

        return { kind: 'retryable_error', errorCode: 'network_unavailable' };
      }
    },
  };
}

function mapRetryableStatus(status: number): 'timeout' | 'rate_limited' | 'network_unavailable' {
  if (status === 408) {
    return 'timeout';
  }

  if (status === 429) {
    return 'rate_limited';
  }

  return 'network_unavailable';
}

function mapPermanentStatus(status: number): 'auth_failed' | 'invalid_response' {
  if (status === 401 || status === 403) {
    return 'auth_failed';
  }

  return 'invalid_response';
}
