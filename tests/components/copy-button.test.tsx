import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { CopyButton } from "@/components/copy-button";

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(),
}));

jest.mock("lucide-react-native", () => {
  const { Text } = require("react-native");
  return {
    Copy: ({ color, size }: { color: string; size: number }) => (
      <Text testID="copy-icon" data-color={color} data-size={size} />
    ),
  };
});

const Clipboard = jest.requireMock("expo-clipboard") as {
  setStringAsync: jest.Mock;
};

describe("CopyButton", () => {
  beforeEach(() => {
    Clipboard.setStringAsync.mockReset();
  });

  test("copies value and calls success callback", async () => {
    Clipboard.setStringAsync.mockResolvedValue(true);
    const onCopied = jest.fn();
    const onCopyFailed = jest.fn();

    render(
      <CopyButton
        value="https://example.test"
        onCopied={onCopied}
        onCopyFailed={onCopyFailed}
      />,
    );

    fireEvent.press(screen.getByLabelText("Copy"));

    await waitFor(() => expect(onCopied).toHaveBeenCalledTimes(1));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("https://example.test");
    expect(onCopyFailed).not.toHaveBeenCalled();
    expect(screen.getByTestId("copy-icon").props["data-size"]).toBe(18);
    expect(screen.getByTestId("copy-icon").props["data-color"]).toBe("#1a1a1a");
  });

  test("treats false and thrown clipboard results as copy failures", async () => {
    Clipboard.setStringAsync
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("denied"));
    const onCopyFailed = jest.fn();

    render(<CopyButton value="sku-1" onCopyFailed={onCopyFailed} />);

    fireEvent.press(screen.getByLabelText("Copy"));
    await waitFor(() => expect(onCopyFailed).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByLabelText("Copy"));
    await waitFor(() => expect(onCopyFailed).toHaveBeenCalledTimes(2));
  });
});
