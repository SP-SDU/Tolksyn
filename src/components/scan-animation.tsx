import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";

import { AppDesign } from "@/constants/design";

// Timings match scan-animation.web so the finder motion feels the same on every platform.
const scanSteps = [
  { value: 1, durationMs: 760 },
  { value: 2, durationMs: 820 },
  { value: 3, durationMs: 700 },
  { value: 4, durationMs: 880 },
  { value: 0, durationMs: 760 },
] as const;

export function ScanAnimation() {
  const progress = useRef(new Animated.Value(0)).current;
  const finder = <ScanFinder />;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.loop(
      Animated.sequence(
        scanSteps.map((step) =>
          Animated.timing(progress, {
            toValue: step.value,
            duration: step.durationMs,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ),
      ),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1, 2, 3, 4],
    outputRange: [-86, 58, -12, 92, -62],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1, 2, 3, 4],
    outputRange: [-108, -44, 70, 12, 112],
  });

  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 items-center justify-center bg-black/15"
    >
      <Animated.View style={{ transform: [{ translateX }, { translateY }] }}>
        {finder}
      </Animated.View>
    </View>
  );
}

function ScanFinder() {
  return (
    <View
      style={{
        width: 92,
        height: 92,
        borderWidth: 3,
        borderColor: AppDesign.color.yellow,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{ width: 8, height: 8, backgroundColor: AppDesign.color.yellow }}
      />
    </View>
  );
}
