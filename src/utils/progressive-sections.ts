import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { scheduleDeferredMount } from "./idle";

export function useProgressiveSections(loading: boolean, sectionCount: number) {
  const [visible, setVisible] = useState(0);
  const runRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const run = ++runRef.current;
      let cancelNext: (() => void) | null = null;
      let cancelled = false;

      if (loading) {
        setVisible(0);

        return () => {
          cancelled = true;
          runRef.current++;
          cancelNext?.();
        };
      }

      setVisible(Math.min(1, sectionCount));

      function advance(stage: number) {
        cancelNext?.();

        cancelNext = scheduleDeferredMount(() => {
          if (cancelled || runRef.current !== run) return;

          setVisible((current) => Math.max(current, stage));

          if (stage < sectionCount) {
            advance(stage + 1);
          }
        });
      }

      if (sectionCount > 1) {
        advance(2);
      }

      return () => {
        cancelled = true;
        runRef.current++;
        cancelNext?.();
      };
    }, [loading, sectionCount]),
  );

  return visible;
}
