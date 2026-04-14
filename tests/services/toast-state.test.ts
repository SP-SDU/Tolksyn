import {
  enqueueToast,
  initialToastState,
  nextToast,
  replaceProgressWithMessage,
  upsertProgressToast,
  type ToastEntry,
} from '@/services/toast-state';

describe('toast state', () => {
  test('enqueues message and promotes next message when dismissed', () => {
    const first: ToastEntry = {
      id: 'first',
      text: 'First',
      tone: 'info',
      mode: 'message',
      durationMs: 2000,
    };
    const second: ToastEntry = {
      id: 'second',
      text: 'Second',
      tone: 'success',
      mode: 'message',
      durationMs: 2000,
    };

    const state1 = enqueueToast(initialToastState, first);
    const state2 = enqueueToast(state1, second);
    const state3 = nextToast(state2);

    expect(state1.active?.id).toBe('first');
    expect(state2.queue.map((item) => item.id)).toEqual(['second']);
    expect(state3.active?.id).toBe('second');
  });

  test('upserts progress toast as active and deduplicates queued progress id', () => {
    const state = {
      active: {
        id: 'msg',
        text: 'Copied',
        tone: 'success',
        mode: 'message',
        durationMs: 2000,
      } as ToastEntry,
      queue: [
        {
          id: 'capture',
          text: 'Old progress',
          tone: 'info',
          mode: 'progress',
          durationMs: 0,
        },
      ] as ToastEntry[],
    };

    const next = upsertProgressToast(state, {
      id: 'capture',
      text: 'Vision-language: running',
      tone: 'info',
      mode: 'progress',
      durationMs: 0,
    });

    expect(next.active?.id).toBe('capture');
    expect(next.active?.text).toContain('running');
    expect(next.queue).toHaveLength(0);
  });

  test('replaces active progress with completion message', () => {
    const state = {
      active: {
        id: 'capture',
        text: 'Vision-language: running',
        tone: 'info',
        mode: 'progress',
        durationMs: 0,
      } as ToastEntry,
      queue: [],
    };

    const next = replaceProgressWithMessage(state, 'capture', {
      id: 'capture:done',
      text: 'Extraction completed',
      tone: 'success',
      mode: 'message',
      durationMs: 2500,
    });

    expect(next.active?.mode).toBe('message');
    expect(next.active?.text).toBe('Extraction completed');
  });
});
