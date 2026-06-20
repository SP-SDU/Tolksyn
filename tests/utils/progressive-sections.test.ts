import { act, renderHook } from "@testing-library/react-native";

import { mockDeferredMount } from "@/tests/helpers/deferred-mount-mock";
import { useProgressiveSections } from "@/utils/progressive-sections";

jest.mock("@/utils/idle", () => {
  const { mockDeferredMount } = jest.requireActual(
    "@/tests/helpers/deferred-mount-mock",
  );

  return { scheduleDeferredMount: mockDeferredMount.scheduleDeferredMount };
});

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
    mockDeferredMount.mounts.length = 0;
    jest.clearAllMocks();
  });

  function runDeferred(index: number): void {
    expect(mockDeferredMount.mounts[index]).toBeDefined();

    act(() => {
      mockDeferredMount.mounts[index].callback();
    });
  }

  test("sets visible to 1 when loading is false with any section count", () => {
    const { result } = renderProgressive(false, 1);

    expect(result.current).toBe(1);
  });

  test("keeps visible at 0 when loading is true", () => {
    const { result } = renderProgressive(true, 3);

    expect(result.current).toBe(0);
    expect(mockDeferredMount.mounts).toHaveLength(0);
  });

  test("progressively reveals sections 1 -> 2 -> 3 for sectionCount=3", () => {
    const { result } = renderProgressive(false, 3);

    expect(result.current).toBe(1);

    runDeferred(0);
    expect(result.current).toBe(2);

    runDeferred(1);
    expect(result.current).toBe(3);
  });

  test("does not schedule progression for single section", () => {
    renderProgressive(false, 1);

    expect(mockDeferredMount.mounts).toHaveLength(0);
  });

  test("does not advance beyond sectionCount", () => {
    const { result } = renderProgressive(false, 2);

    expect(result.current).toBe(1);

    runDeferred(0);

    expect(result.current).toBe(2);
    expect(mockDeferredMount.mounts).toHaveLength(1);
  });

  test("unmount cancels pending progression", () => {
    const { oldMount, unmount } = pendingProgression();

    unmount();

    expect(oldMount.cancel).toHaveBeenCalledTimes(1);
  });

  test("unmount aborts pending progression callback", () => {
    const { result, oldMount, unmount } = pendingProgression();

    unmount();

    act(() => {
      oldMount.callback();
    });

    expect(result.current).toBe(1);
    expect(mockDeferredMount.mounts).toHaveLength(1);
  });

  test("rerender to loading cancels pending progression", () => {
    const { result, rerender, oldMount } = rerenderableProgression();

    expectRerenderToLoadingCancelled(result, rerender, oldMount);
  });

  test("rerender to loading aborts old scheduled progression", () => {
    const { result, rerender, oldMount } = rerenderableProgression();

    expectRerenderToLoadingCancelled(result, rerender, oldMount);

    act(() => {
      oldMount.callback();
    });

    expect(result.current).toBe(0);
    expect(mockDeferredMount.mounts).toHaveLength(1);
  });

  test("rerender with same loading aborts old scheduled progression", () => {
    const { result, rerender, oldMount } = rerenderableProgression();

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
    expect(mockDeferredMount.mounts).toHaveLength(0);

    rerender({ loading: false, count: 3 });

    expect(result.current).toBe(1);

    runDeferred(0);

    expect(result.current).toBe(2);
  });

  function renderProgressive(loading: boolean, count: number) {
    return renderHook(() => useProgressiveSections(loading, count), {
      concurrentRoot: false,
    });
  }

  function pendingProgression() {
    const hook = renderProgressive(false, 5);

    expect(hook.result.current).toBe(1);

    return { ...hook, oldMount: mockDeferredMount.mounts[0] };
  }

  function rerenderableProgression() {
    const hook = renderHook(
      (props: { loading: boolean; count: number }) =>
        useProgressiveSections(props.loading, props.count),
      {
        initialProps: { loading: false, count: 3 },
        concurrentRoot: false,
      },
    );

    expect(hook.result.current).toBe(1);

    return { ...hook, oldMount: mockDeferredMount.mounts[0] };
  }

  function expectRerenderToLoadingCancelled(
    result: ReturnType<typeof rerenderableProgression>["result"],
    rerender: ReturnType<typeof rerenderableProgression>["rerender"],
    oldMount: (typeof mockDeferredMount.mounts)[number],
  ) {
    rerender({ loading: true, count: 3 });

    expect(result.current).toBe(0);
    expect(oldMount.cancel).toHaveBeenCalledTimes(1);
  }
});
