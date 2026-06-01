/** isAbortError expects platform-native AbortError shapes, and a plain Error breaks cancel handling. */
export function createAbortError() {
  if (typeof DOMException !== "undefined") {
    return new DOMException("Aborted", "AbortError");
  }

  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "AbortError",
  );
}

export function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

/** Nested work must abort without tearing down the parent capture signal listeners. */
export function linkAbortSignal(signal: AbortSignal | undefined) {
  const controller = new AbortController();

  const abort = () => {
    controller.abort(signal?.reason);
  };

  if (signal?.aborted) {
    abort();
  } else {
    signal?.addEventListener("abort", abort, { once: true });
  }

  return {
    signal: controller.signal,
    controller,
    cleanup() {
      signal?.removeEventListener("abort", abort);
    },
  };
}
