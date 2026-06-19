import { render, screen } from "@testing-library/react-native";

import { OptionPicker } from "@/components/option-picker";

describe("OptionPicker", () => {
  it("does not render picker content while closed", () => {
    render(
      <OptionPicker
        title="Select Provider"
        open={false}
        items={[{ id: "openai", label: "OpenAI" }]}
        selectedId="openai"
        query=""
        onQueryChange={jest.fn()}
        onClose={jest.fn()}
        onSelect={jest.fn()}
      />,
    );

    expect(screen.queryByLabelText("Close Select Provider")).toBeNull();
    expect(screen.queryByLabelText("Search Select Provider")).toBeNull();
    expect(screen.queryByLabelText("Selected: OpenAI")).toBeNull();
  });

  it("labels modal controls and search input for assistive technology", () => {
    // Arrange
    // Act
    render(
      <OptionPicker
        title="Select Provider"
        open
        items={[{ id: "openai", label: "OpenAI" }]}
        selectedId="openai"
        query=""
        onQueryChange={jest.fn()}
        onClose={jest.fn()}
        onSelect={jest.fn()}
      />,
    );

    // Assert
    // Accessibility labels let screen readers identify dismiss, search, and selection
    expect(screen.getByLabelText("Close Select Provider")).toBeTruthy();
    expect(screen.getByLabelText("Search Select Provider")).toBeTruthy();
    expect(screen.getByLabelText("Selected: OpenAI")).toBeTruthy();
  });
});
