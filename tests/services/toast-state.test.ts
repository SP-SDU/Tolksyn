import {
  enqueueToast,
  initialToastState,
  nextToast,
  replaceProgressWithMessage,
  upsertProgressToast,
  type ToastEntry,
} from "@/services/toast-state";

describe("toast state", () => {
  test("enqueues message and promotes next message when dismissed", () => {
    const first: ToastEntry = {
      id: "first",
      text: "First",
      tone: "info",
      mode: "message",
      durationMs: 2000,
    };
    const second: ToastEntry = {
      id: "second",
      text: "Second",
      tone: "success",
      mode: "message",
      durationMs: 2000,
    };

    const state1 = enqueueToast(initialToastState, first);
    const state2 = enqueueToast(state1, second);
    const state3 = nextToast(state2);

    // First toast becomes active. Second goes to queue. Dismissal promotes queued item
    expect(state1.active?.id).toBe("first");
    expect(state2.queue.map((item) => item.id)).toEqual(["second"]);
    expect(state3.active?.id).toBe("second");
    expect(state3.queue).toEqual([]);
    expect(nextToast(state3)).toEqual({ active: undefined, queue: [] });
  });

  test("upserts progress toast as active and deduplicates queued progress id", () => {
    // Pre-populated state has both an active message and a queued progress
    const state = {
      active: {
        id: "msg",
        text: "Copied",
        tone: "success",
        mode: "message",
        durationMs: 2000,
      } as ToastEntry,
      queue: [
        {
          id: "capture",
          text: "Old progress",
          tone: "info",
          mode: "progress",
          durationMs: 0,
        },
      ] as ToastEntry[],
    };

    // Upsert with same id pulls it from queue and makes it active
    const next = upsertProgressToast(state, {
      id: "capture",
      text: "Vision-language: running",
      tone: "info",
      mode: "progress",
      durationMs: 0,
    });

    expect(next.active?.id).toBe("capture");
    expect(next.active?.text).toContain("running");
    expect(next.queue).toHaveLength(0);
  });

  test("upsert progress removes older progress toasts but keeps unrelated messages", () => {
    const state = {
      active: message("active", "Active"),
      queue: [
        message("queued", "Queued"),
        progress("old-progress", "Old progress"),
        message("capture", "Same id message"),
      ],
    };

    const next = upsertProgressToast(
      state,
      progress("capture", "Vision-language: running"),
    );

    expect(next.active).toEqual(progress("capture", "Vision-language: running"));
    expect(next.queue.map((item) => item.id)).toEqual(["queued"]);
  });

  test("replaces active progress with completion message", () => {
    const state = {
      active: {
        id: "capture",
        text: "Vision-language: running",
        tone: "info",
        mode: "progress",
        durationMs: 0,
      } as ToastEntry,
      queue: [],
    };

    // Progress toast replaced by a completion message with a different id
    const next = replaceProgressWithMessage(state, "capture", {
      id: "capture:done",
      text: "Extraction completed",
      tone: "success",
      mode: "message",
      durationMs: 2500,
    });

    // Mode changes from progress to message. Duration applied
    expect(next.active?.mode).toBe("message");
    expect(next.active?.text).toBe("Extraction completed");
  });

  test("replace progress removes queued progress and preserves active message", () => {
    const state = {
      active: message("active", "Active"),
      queue: [progress("capture", "Running"), message("next", "Next")],
    };

    const next = replaceProgressWithMessage(
      state,
      "capture",
      message("capture:done", "Done"),
    );

    expect(next.active?.id).toBe("active");
    expect(next.queue.map((item) => item.id)).toEqual(["next", "capture:done"]);
  });

  test("replace progress works when no toast is active", () => {
    const next = replaceProgressWithMessage(
      { active: undefined, queue: [progress("capture", "Running")] },
      "capture",
      message("capture:done", "Done"),
    );

    expect(next).toEqual({ active: message("capture:done", "Done"), queue: [] });
  });
});

function message(id: string, text: string): ToastEntry {
  return {
    id,
    text,
    tone: "info",
    mode: "message",
    durationMs: 2000,
  };
}

function progress(id: string, text: string): ToastEntry {
  return {
    id,
    text,
    tone: "info",
    mode: "progress",
    durationMs: 0,
  };
}
