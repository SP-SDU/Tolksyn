import { scheduleDeferredMount } from "@/utils/idle";

describe("scheduleDeferredMount", () => {
  let rafCallbacks: Array<(time: number) => void>;
  let rafIdCounter: number;
  const originalRequestIdleCallback = (globalThis as any).requestIdleCallback;
  const originalCancelIdleCallback = (globalThis as any).cancelIdleCallback;

  beforeEach(() => {
    jest.useFakeTimers();
    rafCallbacks = [];
    rafIdCounter = 0;
    jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return ++rafIdCounter;
    });
    jest.spyOn(globalThis, "cancelAnimationFrame");
    jest.spyOn(globalThis, "clearTimeout");
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    (globalThis as any).requestIdleCallback = originalRequestIdleCallback;
    (globalThis as any).cancelIdleCallback = originalCancelIdleCallback;
  });

  function fireBothRafs(): void {
    expect(rafCallbacks.length).toBeGreaterThanOrEqual(1);
    const cb1 = rafCallbacks.shift()!;
    cb1(0);
    expect(rafCallbacks.length).toBeGreaterThanOrEqual(1);
    const cb2 = rafCallbacks.shift()!;
    cb2(0);
  }

  function strictClearTimeout(): void {
    jest.spyOn(globalThis, "clearTimeout").mockImplementation((handle) => {
      if (handle == null) throw new Error("clearTimeout called with null");
    });
  }

  function mockIdleCallback(handle = 42) {
    const idleCallbacks: Array<() => void> = [];
    (globalThis as any).requestIdleCallback = jest.fn((cb: () => void) => {
      idleCallbacks.push(cb);
      return handle;
    });
    (globalThis as any).cancelIdleCallback = jest.fn();
    return idleCallbacks;
  }

  test("fires callback via requestIdleCallback when available", () => {
    const idleCallbacks = mockIdleCallback(1);

    const callback = jest.fn();
    scheduleDeferredMount(callback);

    fireBothRafs();
    expect(idleCallbacks).toHaveLength(1);
    idleCallbacks[0]();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("falls back to setTimeout when requestIdleCallback is unavailable", () => {
    const callback = jest.fn();
    scheduleDeferredMount(callback);

    fireBothRafs();
    jest.advanceTimersByTime(50);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("falls back to setTimeout with correct delay", () => {
    const callback = jest.fn();
    scheduleDeferredMount(callback);

    fireBothRafs();
    jest.advanceTimersByTime(49);

    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("cancel before first RAF prevents callback and cleans up frameA only", () => {
    strictClearTimeout();

    const callback = jest.fn();
    const cancel = scheduleDeferredMount(callback);

    expect(() => cancel()).not.toThrow();

    fireBothRafs();
    expect(callback).not.toHaveBeenCalled();

    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  test("cancel between RAFs cleans up frameB only", () => {
    strictClearTimeout();

    const callback = jest.fn();
    const cancel = scheduleDeferredMount(callback);

    rafCallbacks[0](0);

    expect(() => cancel()).not.toThrow();
    rafCallbacks[0](0);

    expect(callback).not.toHaveBeenCalled();

    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
  });

  test("cancel after both RAFs but before idle callback prevents fire", () => {
    const idleCallbacks = mockIdleCallback(1);

    const callback = jest.fn();
    const cancel = scheduleDeferredMount(callback);

    fireBothRafs();
    cancel();
    idleCallbacks[0]();

    expect(callback).not.toHaveBeenCalled();
    expect((globalThis as any).cancelIdleCallback).toHaveBeenCalledTimes(1);
  });

  test("cancel on setTimeout path clears the timer", () => {
    const callback = jest.fn();
    const cancel = scheduleDeferredMount(callback);

    fireBothRafs();
    cancel();

    expect(jest.getTimerCount()).toBe(0);

    jest.advanceTimersByTime(100);
    expect(callback).not.toHaveBeenCalled();
  });

  test("cancel before any RAF cleans up frameA only", () => {
    strictClearTimeout();

    scheduleDeferredMount(jest.fn())();

    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  test("cancel is idempotent - calling multiple times is safe", () => {
    const cancel = scheduleDeferredMount(jest.fn());
    cancel();
    expect(() => cancel()).not.toThrow();
    expect(() => cancel()).not.toThrow();
  });

  test("cancel guard prevents callback when timeout fires despite cancellation", () => {
    let timeoutCallback: (() => void) | null = null;
    jest
      .spyOn(globalThis, "setTimeout")
      .mockImplementation((cb: (...args: Array<unknown>) => void) => {
        timeoutCallback = cb as () => void;
        return 1 as any;
      });

    const callback = jest.fn();
    const cancel = scheduleDeferredMount(callback);

    fireBothRafs();
    cancel();
    timeoutCallback!();

    expect(callback).not.toHaveBeenCalled();
  });

  test("cancel on idle path handles missing cancelIdleCallback gracefully", () => {
    mockIdleCallback();
    delete (globalThis as any).cancelIdleCallback;

    const cancel = scheduleDeferredMount(jest.fn());

    fireBothRafs();
    expect(() => cancel()).not.toThrow();
  });

  test("cancel before idle path does not touch idle handle", () => {
    mockIdleCallback();

    const cancel = scheduleDeferredMount(jest.fn());

    ((globalThis as any).cancelIdleCallback as jest.Mock).mockClear();
    cancel();

    expect((globalThis as any).cancelIdleCallback).not.toHaveBeenCalled();
  });

  test("cancel after first RAF on idle path does not touch idle handle", () => {
    mockIdleCallback();

    const cancel = scheduleDeferredMount(jest.fn());

    rafCallbacks[0](0);
    ((globalThis as any).cancelIdleCallback as jest.Mock).mockClear();
    cancel();

    expect((globalThis as any).cancelIdleCallback).not.toHaveBeenCalled();
  });

  test("cancel after first RAF does not call cancelAnimationFrame for consumed frameA", () => {
    const callback = jest.fn();
    const cancel = scheduleDeferredMount(callback);

    rafCallbacks[0](0);
    cancel();

    expect(cancelAnimationFrame).not.toHaveBeenCalledWith(1);
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
  });

  test("cancel after both RAFs on idle path only cancels idle handle", () => {
    mockIdleCallback();

    const cancel = scheduleDeferredMount(jest.fn());

    fireBothRafs();
    cancel();

    expect(cancelAnimationFrame).not.toHaveBeenCalled();
    expect((globalThis as any).cancelIdleCallback).toHaveBeenCalledTimes(1);
    expect((globalThis as any).cancelIdleCallback).toHaveBeenCalledWith(42);
  });

  test("assert callback called exactly once if not cancelled", () => {
    (globalThis as any).requestIdleCallback = jest.fn((cb: () => void) => {
      cb();
      return 1;
    });

    const callback = jest.fn();
    scheduleDeferredMount(callback);

    fireBothRafs();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
