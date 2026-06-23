import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";

import {
  AppHeader,
  BrutalFrame,
  FieldRow,
  StatusPill,
  StickyActionBar,
} from "@/components/ui/app-chrome";

describe("app chrome primitives", () => {
  test("AppHeader renders optional eyebrow, meta, action, and heading semantics", () => {
    render(
      <AppHeader
        eyebrow="Capture"
        title="Tolksyn"
        meta="3 pending"
        action={<Text>Sync</Text>}
      />,
    );

    expect(screen.getByText("Capture").props.className).toContain("tracking-[2px]");
    expect(screen.getByText("Tolksyn").props.role).toBe("heading");
    expect(screen.getByText("Tolksyn").props.accessibilityRole).toBe("header");
    expect(screen.getByText("3 pending").props.className).toContain("text-muted");
    expect(screen.getByText("Sync")).toBeTruthy();
  });

  test("AppHeader omits absent optional regions", () => {
    render(<AppHeader title="History" />);

    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.queryByText("Capture")).toBeNull();
    expect(screen.queryByText("3 pending")).toBeNull();
  });

  test("BrutalFrame and StickyActionBar merge base and caller classes", () => {
    render(
      <>
        <BrutalFrame testID="frame" className="mt-4" />
        <StickyActionBar testID="bar" className="gap-3" />
      </>,
    );

    expect(screen.getByTestId("frame").props.className).toContain("border-2");
    expect(screen.getByTestId("frame").props.className).toContain("mt-4");
    expect(screen.getByTestId("bar").props.className).toContain("border-t-2");
    expect(screen.getByTestId("bar").props.className).toContain("gap-3");
  });

  test("FieldRow and StatusPill apply tone classes", () => {
    const { UNSAFE_getAllByType } = render(
      <>
        <FieldRow label="Status" value="Ready" tone="success" />
        <StatusPill label="Failed" tone="danger" className="mt-2" />
      </>,
    );
    const status = UNSAFE_getAllByType(View).find(
      (view) => view.props.role === "status",
    );

    expect(screen.getByText("Status").props.className).toContain("uppercase");
    expect(screen.getByText("Ready").props.className).toContain("text-signalBlue");
    expect(status?.props.className).toContain("bg-danger");
    expect(status?.props.className).toContain("mt-2");
  });
});
