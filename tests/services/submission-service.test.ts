import { createSubmissionService } from '@/services/submission-service';
import { emptyStructuredItem } from '@/types/item-schema';

describe('createSubmissionService', () => {
  test('sends immediately when online and transport succeeds', async () => {
    const markSent = jest.fn();
    const markQueued = jest.fn();
    const enqueue = jest.fn();
    const submit = jest.fn().mockResolvedValue({ kind: 'success' });
    const service = createSubmissionService({
      attempts: {
        markSent,
        markQueued,
        markFailed: jest.fn(),
      },
      queue: {
        enqueue,
      },
      transport: { submit },
      network: {
        isOnline: async () => true,
      },
      createIdempotencyKey: async () => 'idempotency-key',
      now: () => 10,
    });

    const result = await service.acceptAttempt({
      attemptId: 'attempt-1',
      acceptedRevision: 1,
      payload: {
        schemaVersion: 'tolksyn.item.v1',
        attemptId: 'attempt-1',
        acceptedRevision: 1,
        structuredJson: emptyStructuredItem(),
        barcodeEnrichment: {
          detected: [],
          primary: null,
          relatedFieldSuggestions: { eanOrUpc: null },
          conflicts: [],
        },
        metadata: { source: 'camera' },
      },
    });

    expect(result).toEqual({ outcome: 'sent', idempotencyKey: 'idempotency-key' });
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'idempotency-key' }),
    );
    expect(markSent).toHaveBeenCalledWith('attempt-1');
    expect(enqueue).not.toHaveBeenCalled();
    expect(markQueued).not.toHaveBeenCalled();
  });

  test('queues immediately when offline', async () => {
    const markQueued = jest.fn();
    const enqueue = jest.fn();
    const service = createSubmissionService({
      attempts: {
        markSent: jest.fn(),
        markQueued,
        markFailed: jest.fn(),
      },
      queue: {
        enqueue,
      },
      transport: { submit: jest.fn() },
      network: {
        isOnline: async () => false,
      },
      createIdempotencyKey: async () => 'idempotency-key',
      now: () => 10,
    });

    const result = await service.acceptAttempt({
      attemptId: 'attempt-1',
      acceptedRevision: 2,
      payload: {
        schemaVersion: 'tolksyn.item.v1',
        attemptId: 'attempt-1',
        acceptedRevision: 2,
        structuredJson: emptyStructuredItem(),
        barcodeEnrichment: {
          detected: [],
          primary: null,
          relatedFieldSuggestions: { eanOrUpc: null },
          conflicts: [],
        },
        metadata: { source: 'camera' },
      },
    });

    expect(result).toEqual({ outcome: 'queued', idempotencyKey: 'idempotency-key' });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: 'attempt-1',
        acceptedRevision: 2,
        idempotencyKey: 'idempotency-key',
      }),
    );
    expect(markQueued).toHaveBeenCalledWith('attempt-1', 2);
  });

  test('queues retryable transport failures instead of dropping them', async () => {
    const markQueued = jest.fn();
    const service = createSubmissionService({
      attempts: {
        markSent: jest.fn(),
        markQueued,
        markFailed: jest.fn(),
      },
      queue: {
        enqueue: jest.fn(),
      },
      transport: {
        submit: jest.fn().mockResolvedValue({ kind: 'retryable_error', errorCode: 'network_unavailable' }),
      },
      network: {
        isOnline: async () => true,
      },
      createIdempotencyKey: async () => 'idempotency-key',
      now: () => 10,
    });

    const result = await service.acceptAttempt({
      attemptId: 'attempt-1',
      acceptedRevision: 3,
      payload: {
        schemaVersion: 'tolksyn.item.v1',
        attemptId: 'attempt-1',
        acceptedRevision: 3,
        structuredJson: emptyStructuredItem(),
        barcodeEnrichment: {
          detected: [],
          primary: null,
          relatedFieldSuggestions: { eanOrUpc: null },
          conflicts: [],
        },
        metadata: { source: 'camera' },
      },
    });

    expect(result).toEqual({ outcome: 'queued', idempotencyKey: 'idempotency-key' });
    expect(markQueued).toHaveBeenCalledWith('attempt-1', 3);
  });
});
