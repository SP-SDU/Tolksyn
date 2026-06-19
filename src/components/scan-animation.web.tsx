import { useEffect, useRef } from "react";
import { View, type ViewStyle } from "react-native";

import { ScanFinder } from "@/components/scan-finder";

// CSS keyframes keep the same finder path as native without pulling RN Animated onto web.
const KEYFRAMES = `
@keyframes scan-finder {
  0% {
    transform: translate(-86px, -108px);
  }
  20% {
    transform: translate(58px, -44px);
  }
  40% {
    transform: translate(-12px, 70px);
  }
  60% {
    transform: translate(92px, 12px);
  }
  80% {
    transform: translate(-62px, 112px);
  }
  100% {
    transform: translate(-86px, -108px);
  }
}
`;

export function ScanAnimation() {
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = KEYFRAMES;
    document.head.appendChild(style);
    styleRef.current = style;

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const finder = <ScanFinder />;

  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 items-center justify-center bg-black/15"
    >
      <View
        style={
          {
            animation: "scan-finder 3.9s ease-in-out infinite",
            willChange: "transform",
          } as unknown as ViewStyle
        }
      >
        {finder}
      </View>
    </View>
  );
}
