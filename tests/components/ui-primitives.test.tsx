import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { Input, LabeledInput } from "@/components/ui/input";
import { Screen, ScreenView } from "@/components/ui/screen";
import { Section } from "@/components/ui/section";

describe("ui primitives", () => {
  test("input applies base classes, custom classes, and placeholder color", () => {
    render(<Input testID="input" className="mt-2 px-6" value="" />);

    const input = screen.getByTestId("input");
    expect(input.props.className).toContain("min-h-12");
    expect(input.props.className).toContain("px-6");
    expect(input.props.placeholderTextColor).toBe("#5f5a52");
  });

  test("labeled input uses visible label unless explicit accessibility label is provided", () => {
    render(
      <LabeledInput
        label="Endpoint URL"
        accessibilityLabel="Ingest endpoint"
        labelClassName="text-red"
        value=""
      />,
    );

    expect(screen.getByText("Endpoint URL").props.className).toContain(
      "text-red",
    );
    expect(screen.getByLabelText("Ingest endpoint")).toBeTruthy();
  });

  test("screen wrappers expose main role and merge layout classes", () => {
    render(
      <>
        <Screen testID="screen" className="pt-8" />
        <ScreenView testID="screen-view" className="gap-4" />
      </>,
    );

    expect(screen.getByTestId("screen").props.role).toBe("main");
    expect(screen.getByTestId("screen").props.className).toBe("bg-background");
    expect(screen.getByTestId("screen").props.contentContainerClassName).toContain(
      "pt-8",
    );
    expect(screen.getByTestId("screen-view").props.role).toBe("main");
    expect(screen.getByTestId("screen-view").props.className).toContain("gap-4");
  });

  test("section renders heading and children with merged classes", () => {
    render(
      <Section testID="section" title="Provider" className="mt-4">
        <Text>Body</Text>
      </Section>,
    );

    expect(screen.getByTestId("section").props.className).toContain("mt-4");
    expect(screen.getByText("Provider").props.role).toBe("heading");
    expect(screen.getByText("Provider").props.accessibilityRole).toBe("header");
    expect(screen.getByText("Body")).toBeTruthy();
  });
});
