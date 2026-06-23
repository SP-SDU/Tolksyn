import { fireEvent, render, screen } from "@testing-library/react-native";

import { HapticTab } from "@/components/haptic-tab";

jest.mock("@react-navigation/elements", () => {
  const { Pressable } = require("react-native");
  return {
    PlatformPressable: (props: object) => <Pressable {...props} />,
  };
});

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "Light" },
  impactAsync: jest.fn(),
}));

const Haptics = jest.requireMock("expo-haptics") as {
  ImpactFeedbackStyle: { Light: string };
  impactAsync: jest.Mock;
};

describe("HapticTab", () => {
  beforeEach(() => {
    Haptics.impactAsync.mockReset();
  });

  test("runs haptics only for throttled iOS tab press-in and forwards event", () => {
    const originalExpoOs = process.env.EXPO_OS;
    const now = jest
      .spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_100)
      .mockReturnValueOnce(1_300);
    const onPressIn = jest.fn();
    process.env.EXPO_OS = "ios";

    try {
      render(<HapticTab testID="tab" onPressIn={onPressIn} /> as any);

      fireEvent(screen.getByTestId("tab"), "pressIn", { nativeEvent: { x: 1 } });
      fireEvent(screen.getByTestId("tab"), "pressIn", { nativeEvent: { x: 2 } });
      fireEvent(screen.getByTestId("tab"), "pressIn", { nativeEvent: { x: 3 } });

      expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
      expect(Haptics.impactAsync).toHaveBeenCalledWith("Light");
      expect(onPressIn).toHaveBeenCalledTimes(3);
      expect(onPressIn).toHaveBeenLastCalledWith({ nativeEvent: { x: 3 } });
    } finally {
      process.env.EXPO_OS = originalExpoOs;
      now.mockRestore();
    }
  });
});
