import { act, fireEvent, render } from "@testing-library/react-native";

import { Button } from "@/components/ui/button";
import { AppDesign } from "@/constants/theme";

describe("Button", () => {
  it("uses the design red for primary buttons", () => {
    const view = render(<Button testID="button" label="Capture" />);
    const button = view.getByTestId("button");

    // Primary style: brand red background with light text for contrast
    expect(button).toHaveStyle({ backgroundColor: AppDesign.color.red });
    expect(view.getByText("Capture")).toHaveStyle({
      color: AppDesign.color.paper,
    });
  });

  it.each([
    ["secondary", AppDesign.color.panel, AppDesign.color.ink],
    ["ghost", "transparent", AppDesign.color.ink],
    ["caution", AppDesign.color.yellow, AppDesign.color.ink],
    ["ink", AppDesign.color.ink, AppDesign.color.paper],
  ] as const)(
    "uses expected colors for %s buttons",
    (variant, backgroundColor, color) => {
      const view = render(
        <Button testID="button" label="Capture" variant={variant} />,
      );

      expect(view.getByTestId("button")).toHaveStyle({ backgroundColor });
      expect(view.getByText("Capture")).toHaveStyle({ color });
    },
  );

  it.each([
    [undefined, "h-12"],
    ["sm", "h-10"],
    ["lg", "h-14"],
  ] as const)("applies %s size class", (size, expectedClass) => {
    const view = render(<Button testID="button" label="Capture" size={size} />);

    expect(view.getByTestId("button").props.className).toContain(expectedClass);
    expect(view.getByTestId("button").props.className).toContain("min-h-12");
    expect(view.getByTestId("button").props.className).not.toContain(
      "Stryker was here!",
    );
  });

  it("applies ghost and text utility classes", () => {
    const view = render(<Button testID="button" label="Capture" variant="ghost" />);

    expect(view.getByTestId("button").props.className).toContain(
      "border-transparent",
    );
    expect(view.getByText("Capture").props.className).toContain(
      "uppercase tracking-wide",
    );
  });

  it.each([
    ["primary", AppDesign.color.yellow],
    ["secondary", AppDesign.color.yellow],
    ["ghost", AppDesign.color.panelMuted],
    ["caution", AppDesign.color.red],
    ["ink", AppDesign.color.yellow],
  ] as const)("uses expected pressed color for %s buttons", (variant, color) => {
    const view = render(
      <Button testID="button" label="Capture" variant={variant} />,
    );
    const button = view.getByTestId("button");

    fireEvent(button, "pressIn");

    expect(button).toHaveStyle({ backgroundColor: color });
  });

  it("visually depresses while pressed", () => {
    const view = render(<Button testID="button" label="Capture" />);
    const button = view.getByTestId("button");

    // Normal state has no press transformation
    expect(button).not.toHaveStyle({ opacity: 0.7 });

    fireEvent(button, "pressIn");

    // Press feedback: dimmed, shifted down, slightly scaled for tactile feel
    expect(button).toHaveStyle({
      opacity: 0.68,
      transform: [{ translateY: 4 }, { scale: 0.97 }],
    });
  });

  it("does not depress when disabled", () => {
    const view = render(<Button testID="button" label="Capture" disabled />);
    const button = view.getByTestId("button");

    fireEvent(button, "pressIn");

    expect(button).toHaveStyle({
      opacity: 0.5,
      transform: [{ translateY: 0 }, { scale: 1 }],
      backgroundColor: AppDesign.color.red,
    });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("passes pressed state to style function", () => {
    const view = render(
      <Button
        testID="button"
        label="Capture"
        style={({ pressed }) => ({ borderRadius: pressed ? 12 : 4 })}
      />,
    );
    const button = view.getByTestId("button");

    expect(button).toHaveStyle({ borderRadius: 4 });
    fireEvent(button, "pressIn");
    expect(button).toHaveStyle({ borderRadius: 12 });
  });

  it("calls press callbacks when provided", () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    const view = render(
      <Button
        testID="button"
        label="Capture"
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      />,
    );
    const button = view.getByTestId("button");

    fireEvent(button, "pressIn");
    fireEvent(button, "pressOut");

    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it("holds pressed state briefly after press out", () => {
    jest.useFakeTimers();
    const onPressOut = jest.fn();
    const view = render(
      <Button testID="button" label="Capture" onPressOut={onPressOut} />,
    );
    const button = view.getByTestId("button");

    fireEvent(button, "pressIn");
    fireEvent(button, "pressOut");

    expect(onPressOut).toHaveBeenCalledTimes(1);
    expect(button).toHaveStyle({ opacity: 0.68 });

    act(() => {
      jest.advanceTimersByTime(140);
    });

    expect(button).toHaveStyle({ opacity: 1 });
    jest.useRealTimers();
  });
});
