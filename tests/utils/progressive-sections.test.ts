import { act, renderHook } from "@testing-library/react-native";

import { useProgressiveSections } from "@/utils/progressive-sections";

const mockDeferredMounts: Array<{
  callback: () => void;
  cancel: jest.Mock;
}> = [];

jest.mock("@/utils/idle", () => ({
  scheduleDeferredMount: jest.fn((callback: () => void) => {
    const cancel = jest.fn();
    mockDeferredMounts.push({ callback, cancel });
    return cancel;
  }),
}));

jest.mock("expo-router", () => {
  const React = jest.requireActual("react");
  return {
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => {
        const cleanup = cb();
        return cleanup;
      }, [cb]);
    },
  };
});

describe("useProgressiveSections", () => {
  beforeEach(() => {
    mockDeferredMounts.length = 0;
    jest.clearAllMocks();
  });

  function runDeferred(index: number): void {
    expect(mockDeferredMounts[index]).toBeDefined();

    act(() => {
      mockDeferredMounts[index].callback();
    });
  }

  test("sets visible to 1 when loading is false with any section count", () => {
    const { result } = renderHook(() => useProgressiveSections(false, 1), {
      concurrentRoot: false,
    });

    expect(result.current).toBe(1);
  });

  test("keeps visible at 0 when loading is true", () => {
    const { result } = renderHook(() => useProgressiveSections(true, 3), {
      concurrentRoot: false,
    });

    expect(result.current).toBe(0);
    expect(mockDeferredMounts).toHaveLength(0);
  });

  test("progressively reveals sections 1 -> 2 -> 3 for sectionCount=3", () => {
    const { result } = renderHook(() => useProgressiveSections(false, 3), {
      concurrentRoot: false,
    });

    expect(result.current).toBe(1);

    runDeferred(0);
    expect(result.current).toBe(2);

    runDeferred(1);
    expect(result.current).toBe(3);
  });

  test("does not schedule progression for single section", () => {
    renderHook(() => useProgressiveSections(false, 1), {
      concurrentRoot: false,
    });

    expect(mockDeferredMounts).toHaveLength(0);
  });

  test("does not advance beyond sectionCount", () => {
    const { result } = renderHook(() => useProgressiveSections(false, 2), {
      concurrentRoot: false,
    });

    expect(result.current).toBe(1);

    runDeferred(0);

    expect(result.current).toBe(2);
    expect(mockDeferredMounts).toHaveLength(1);
  });

  test("unmount cancels pending progression", () => {
    const { result, unmount } = renderHook(
      () => useProgressiveSections(false, 5),
      { concurrentRoot: false },
    );

    expect(result.current).toBe(1);

    const oldMount = mockDeferredMounts[0];

    unmount();

    expect(oldMount.cancel).toHaveBeenCalledTimes(1);
  });

  test("unmount aborts pending progression callback", () => {
    const { result, unmount } = renderHook(
      () => useProgressiveSections(false, 5),
      { concurrentRoot: false },
    );

    expect(result.current).toBe(1);

    const oldMount = mockDeferredMounts[0];

    unmount();

    act(() => {
      oldMount.callback();
    });

    expect(result.current).toBe(1);
    expect(mockDeferredMounts).toHaveLength(1);
  });

  test("rerender to loading cancels pending progression", () => {
    const { result, rerender } = renderHook(
      (props: { loading: boolean; count: number }) =>
        useProgressiveSections(props.loading, props.count),
      {
        initialProps: { loading: false, count: 3 },
        concurrentRoot: false,
      },
    );

    expect(result.current).toBe(1);

    const oldMount = mockDeferredMounts[0];

    rerender({ loading: true, count: 3 });

    expect(result.current).toBe(0);
    expect(oldMount.cancel).toHaveBeenCalledTimes(1);
  });

  test("rerender to loading aborts old scheduled progression", () => {
    const { result, rerender } = renderHook(
      (props: { loading: boolean; count: number }) =>
        useProgressiveSections(props.loading, props.count),
      {
        initialProps: { loading: false, count: 3 },
        concurrentRoot: false,
      },
    );

    expect(result.current).toBe(1);

    const oldMount = mockDeferredMounts[0];

    rerender({ loading: true, count: 3 });

    expect(result.current).toBe(0);
    expect(oldMount.cancel).toHaveBeenCalledTimes(1);

    act(() => {
      oldMount.callback();
    });

    expect(result.current).toBe(0);
    expect(mockDeferredMounts).toHaveLength(1);
  });

  test("rerender with same loading aborts old scheduled progression", () => {
    const { result, rerender } = renderHook(
      (props: { loading: boolean; count: number }) =>
        useProgressiveSections(props.loading, props.count),
      {
        initialProps: { loading: false, count: 3 },
        concurrentRoot: false,
      },
    );

    expect(result.current).toBe(1);

    const oldMount = mockDeferredMounts[0];

    rerender({ loading: false, count: 5 });

    expect(result.current).toBe(1);
    expect(oldMount.cancel).toHaveBeenCalledTimes(1);

    act(() => {
      oldMount.callback();
    });

    expect(result.current).toBe(1);
  });

  test("switching from loading=true to loading=false resets and progresses", () => {
    const { result, rerender } = renderHook(
      (props: { loading: boolean; count: number }) =>
        useProgressiveSections(props.loading, props.count),
      {
        initialProps: { loading: true, count: 3 },
        concurrentRoot: false,
      },
    );

    expect(result.current).toBe(0);
    expect(mockDeferredMounts).toHaveLength(0);

    rerender({ loading: false, count: 3 });

    expect(result.current).toBe(1);

    runDeferred(0);

    expect(result.current).toBe(2);
  });
});
