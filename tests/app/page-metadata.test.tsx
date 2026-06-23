import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

import HistoryRoute from "@/app/(tabs)/history";
import CaptureRoute from "@/app/(tabs)/index";
import SettingsRoute from "@/app/(tabs)/settings";
import ConfirmRoute from "@/app/confirm/[attemptId]";

jest.mock("expo-router/head", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <head>{children}</head>
  ),
}));

jest.mock("expo-router", () => ({
  Redirect: () => null,
  useLocalSearchParams: () => ({ attemptId: "attempt-1" }),
}));

jest.mock("@/screens/capture", () => ({ CaptureScreen: () => null }));
jest.mock("@/screens/history", () => ({ HistoryScreen: () => null }));
jest.mock("@/screens/settings", () => ({ SettingsScreen: () => null }));
jest.mock("@/screens/confirm", () => ({ ConfirmScreen: () => null }));

describe("page metadata", () => {
  it.each([
    [CaptureRoute, "Tolksyn Capture"],
    [HistoryRoute, "Tolksyn History"],
    [SettingsRoute, "Tolksyn Settings"],
    [ConfirmRoute, "Tolksyn Verify"],
  ])("sets a document title", (Route, expectedTitle) => {
    const title = findTitle(Route() as ReactElement);

    // Each route renders a <title> tag for browser tab / accessibility
    expect(title).toBe(expectedTitle);
  });
});

function findTitle(node: ReactNode): string | null {
  if (!isValidElement(node)) {
    return null;
  }

  if (node.type === "title") {
    return Children.toArray(
      (node.props as { children?: ReactNode }).children,
    ).join("");
  }

  for (const child of Children.toArray(
    (node.props as { children?: ReactNode }).children,
  )) {
    const title = findTitle(child);
    if (title) {
      return title;
    }
  }

  return null;
}
