type IdleScheduler = typeof globalThis & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function scheduleDeferredMount(callback: () => void) {
  const scheduler = globalThis as IdleScheduler;
  let cancelled = false;
  let frameA: number | null = null;
  let frameB: number | null = null;
  let idleHandle: number | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  frameA = requestAnimationFrame(() => {
    frameA = null;

    frameB = requestAnimationFrame(() => {
      frameB = null;

      if (typeof scheduler.requestIdleCallback === "function") {
        idleHandle = scheduler.requestIdleCallback(() => {
          idleHandle = null;
          if (!cancelled) callback();
        });

        return;
      }

      timeout = setTimeout(() => {
        timeout = null;
        if (!cancelled) callback();
      }, 50);
    });
  });

  return () => {
    cancelled = true;

    if (frameA != null) cancelAnimationFrame(frameA);
    if (frameB != null) cancelAnimationFrame(frameB);
    if (idleHandle != null) scheduler.cancelIdleCallback?.(idleHandle);
    if (timeout != null) clearTimeout(timeout);
  };
}
