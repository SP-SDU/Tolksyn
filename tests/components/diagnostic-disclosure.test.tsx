import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { DiagnosticDisclosure } from "@/components/ui/diagnostic-disclosure";

describe("DiagnosticDisclosure", () => {
  it("keeps diagnostic details collapsed until requested", () => {
    render(
      <DiagnosticDisclosure label="Diagnostics">
        <Text>Raw provider response</Text>
      </DiagnosticDisclosure>,
    );

    // Content hidden by default to avoid overwhelming the user
    expect(screen.queryByText("Raw provider response")).toBeNull();

    fireEvent.press(screen.getByText("Diagnostics"));

    // Content revealed on press (opt-in for technical detail)
    expect(screen.getByText("Raw provider response")).toBeTruthy();
  });
});
