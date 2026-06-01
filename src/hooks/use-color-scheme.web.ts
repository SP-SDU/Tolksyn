import { useEffect, useState } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";

/** Mismatch here causes a flash of wrong theme on first paint after SSR hydration. */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return "light";
}
