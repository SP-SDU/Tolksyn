import { fireEvent, render } from "@testing-library/react-native";

import { Button } from "@/components/ui/button";
import { AppDesign } from "@/constants/theme";

describe("Button", () => {
  it("uses the design red for primary buttons", () => {
    // Arrange
    // Act
    const view = render(<Button testID="button" label="Capture" />);
    const button = view.getByTestId("button");

    // Assert
    // Primary style: brand red background with light text for contrast
    expect(button).toHaveStyle({ backgroundColor: AppDesign.color.red });
    expect(view.getByText("Capture")).toHaveStyle({
      color: AppDesign.color.paper,
    });
  });

  it("visually depresses while pressed", () => {
    // Arrange
    const view = render(<Button testID="button" label="Capture" />);
    const button = view.getByTestId("button");

    // Assert: normal state has no press transformation
    expect(button).not.toHaveStyle({ opacity: 0.7 });

    // Act
    fireEvent(button, "pressIn");

    // Assert
    // Press feedback: dimmed, shifted down, slightly scaled for tactile feel
    expect(button).toHaveStyle({
      opacity: 0.68,
      transform: [{ translateY: 4 }, { scale: 0.97 }],
    });
  });
});
