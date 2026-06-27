import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { ProviderConfigurationReminder } from "@/components/provider-configuration-reminder";
import { defaultSettings } from "@/types/settings";

const mockPush = jest.fn();
const mockRuntime = {
  settings: {
    getSettings: jest.fn(),
    saveSettings: jest.fn(),
  },
};

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/providers/app-provider", () => ({
  useAppRuntime: () => mockRuntime,
}));

describe("ProviderConfigurationReminder", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockRuntime.settings.getSettings.mockReset();
    mockRuntime.settings.saveSettings.mockReset();
  });

  test("shows when provider is not configured and reminder is enabled", async () => {
    mockRuntime.settings.getSettings.mockResolvedValue(defaultSettings());

    const screen = render(<ProviderConfigurationReminder />, {
      concurrentRoot: false,
    });

    expect(await screen.findByText("Provider not configured")).toBeTruthy();
    expect(screen.getByText("Open Settings")).toBeTruthy();
  });

  test("does not show when reminder is disabled", async () => {
    const settings = defaultSettings();
    settings.reminders.providerConfiguration.enabled = false;
    mockRuntime.settings.getSettings.mockResolvedValue(settings);

    const screen = render(<ProviderConfigurationReminder />, {
      concurrentRoot: false,
    });

    await waitFor(() =>
      expect(mockRuntime.settings.getSettings).toHaveBeenCalled(),
    );

    expect(screen.queryByText("Provider not configured")).toBeNull();
  });

  test("can disable reminder before opening settings", async () => {
    const settings = defaultSettings();
    mockRuntime.settings.getSettings.mockResolvedValue(settings);
    mockRuntime.settings.saveSettings.mockResolvedValue(undefined);

    const screen = render(<ProviderConfigurationReminder />, {
      concurrentRoot: false,
    });
    await screen.findByText("Provider not configured");

    fireEvent.press(screen.getByRole("checkbox", { name: "Don't remind me" }));
    fireEvent.press(screen.getByText("Open Settings"));

    await waitFor(() => {
      expect(mockRuntime.settings.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          reminders: {
            providerConfiguration: {
              enabled: false,
            },
          },
        }),
      );
    });
    expect(mockPush).toHaveBeenCalledWith("/settings");
  });
});
