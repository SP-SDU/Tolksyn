export type ToastTone = "info" | "success" | "warning" | "error";

export type ToastEntry = {
  id: string;
  text: string;
  tone: ToastTone;
  mode: "message" | "progress";
  durationMs: number;
};

export type ToastState = {
  active?: ToastEntry;
  queue: ToastEntry[];
};

export const initialToastState: ToastState = {
  active: undefined,
  queue: [],
};

export function enqueueToast(state: ToastState, entry: ToastEntry): ToastState {
  if (!state.active) {
    return {
      active: entry,
      queue: state.queue,
    };
  }

  return {
    active: state.active,
    queue: [...state.queue, entry],
  };
}

export function nextToast(state: ToastState): ToastState {
  if (!state.queue.length) {
    return {
      active: undefined,
      queue: [],
    };
  }

  return {
    active: state.queue[0],
    queue: state.queue.slice(1),
  };
}

/** Only one pipeline progress message should be visible at a time during capture. */
export function upsertProgressToast(
  state: ToastState,
  entry: ToastEntry,
): ToastState {
  const nextQueue = state.queue.filter(
    (item) => item.id !== entry.id && item.mode !== "progress",
  );
  return {
    active: entry,
    queue: nextQueue,
  };
}

export function replaceProgressWithMessage(
  state: ToastState,
  progressId: string,
  message: ToastEntry,
): ToastState {
  const withoutProgress = {
    active: state.active?.id === progressId ? undefined : state.active,
    queue: state.queue.filter((item) => item.id !== progressId),
  };

  return enqueueToast(withoutProgress, message);
}
