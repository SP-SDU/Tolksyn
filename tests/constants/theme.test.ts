import tailwindConfig from "../../tailwind.config";

import { AppTheme } from "@/constants/theme";

test("tailwind colors use the app theme tokens", () => {
  expect(tailwindConfig.theme.extend.colors).toMatchObject({
    background: AppTheme.color.paper,
    foreground: AppTheme.color.ink,
    muted: AppTheme.color.mutedInk,
    border: AppTheme.color.ink,
    card: AppTheme.color.panel,
    primary: AppTheme.color.red,
    secondary: AppTheme.color.ink,
    tertiary: AppTheme.color.yellow,
    accent: AppTheme.color.red,
    accentForeground: AppTheme.color.paper,
    panelMuted: AppTheme.color.panelMuted,
    imageBase: AppTheme.color.imageBase,
    caution: AppTheme.color.yellow,
    danger: AppTheme.color.red,
    signalBlue: AppTheme.color.blue,
    signalBlueSoft: AppTheme.color.blueSoft,
  });
});
