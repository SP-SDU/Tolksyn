import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { DiagnosticDisclosure } from "@/components/ui/diagnostic-disclosure";

describe("DiagnosticDisclosure", () => {
  it("keeps diagnostic details collapsed until requested", () => {
    // Arrange
    // Act
    render(
      <DiagnosticDisclosure label="Diagnostics">
        <Text>Raw provider response</Text>
      </DiagnosticDisclosure>,
    );

    // Assert
    // Content hidden by default to avoid overwhelming the user
    expect(screen.queryByText("Raw provider response")).toBeNull();

    // Act
    fireEvent.press(screen.getByText("Diagnostics"));

    // Assert
    // Content revealed on press (opt-in for technical detail)
    expect(screen.getByText("Raw provider response")).toBeTruthy();
  });
});
