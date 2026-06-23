import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { scheduleDeferredMount } from "./idle";

export function useProgressiveSections(loading: boolean, sectionCount: number) {
  const [visible, setVisible] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (loading) {
        setVisible(0);
        return undefined;
      }

      const initialVisible = Math.min(1, sectionCount);
      setVisible(initialVisible);

      if (sectionCount <= initialVisible) {
        return undefined;
      }

      const controller = new AbortController();
      let cancelNext: () => void;

      function advance(stage: number) {
        cancelNext = scheduleDeferredMount(() => {
          if (controller.signal.aborted) return;

          setVisible((current) => Math.max(current, stage));

          if (stage < sectionCount) {
            advance(stage + 1);
          }
        });
      }

      advance(2);

      return () => {
        controller.abort();
        cancelNext();
      };
    }, [loading, sectionCount]),
  );

  return visible;
}
