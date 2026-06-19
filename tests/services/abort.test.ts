import {
  createAbortError,
  isAbortError,
  linkAbortSignal,
} from "@/services/abort";

describe("abort utilities", () => {
  test("creates errors that are recognized as abort errors", () => {
    const error = createAbortError();

    expect(error).toBeInstanceOf(DOMException);
    expect(error.message).toBe("Aborted");
    expect(isAbortError(error)).toBe(true);
  });

  test("creates AbortError fallback when DOMException is unavailable", () => {
    const originalDOMException = global.DOMException;

    try {
      Object.defineProperty(global, "DOMException", {
        configurable: true,
        value: undefined,
      });

      const error = createAbortError();

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Aborted");
      expect(error.name).toBe("AbortError");
    } finally {
      Object.defineProperty(global, "DOMException", {
        configurable: true,
        value: originalDOMException,
      });
    }
  });

  test("recognizes platform AbortError-shaped errors only", () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";

    expect(isAbortError(abortError)).toBe(true);
    expect(isAbortError(new Error("Aborted"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError({})).toBe(false);
    expect(isAbortError({ name: "OtherError" })).toBe(false);
  });

  test("links parent aborts to child signal", () => {
    const parent = new AbortController();
    const linked = linkAbortSignal(parent.signal);
    const reason = new Error("Cancelled");

    parent.abort(reason);

    expect(linked.signal.aborted).toBe(true);
    expect(linked.signal.reason).toBe(reason);
  });

  test("creates an independent child signal when no parent is provided", () => {
    const linked = linkAbortSignal(undefined);

    expect(linked.signal.aborted).toBe(false);
    expect(() => linked.cleanup()).not.toThrow();
  });

  test("registers parent abort listener once and removes it on cleanup", () => {
    const parent = {
      aborted: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    } as unknown as AbortSignal;

    const linked = linkAbortSignal(parent);

    expect(parent.addEventListener).toHaveBeenCalledWith(
      "abort",
      expect.any(Function),
      { once: true },
    );

    linked.cleanup();

    expect(parent.removeEventListener).toHaveBeenCalledWith(
      "abort",
      expect.any(Function),
    );
  });

  test("links already aborted parent signals", () => {
    const parent = new AbortController();
    const reason = new Error("Already cancelled");

    parent.abort(reason);

    const linked = linkAbortSignal(parent.signal);

    expect(linked.signal.aborted).toBe(true);
    expect(linked.signal.reason).toBe(reason);
  });

  test("cleanup stops future parent abort propagation", () => {
    const parent = new AbortController();
    const linked = linkAbortSignal(parent.signal);

    linked.cleanup();
    parent.abort();

    expect(linked.signal.aborted).toBe(false);
  });
});
