/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';
import { AppColorScheme } from '@/constants/color-scheme';

const tintColorLight = AppColorScheme.light.primary;
const tintColorDark = AppColorScheme.dark.primary;

export const Colors = {
  light: {
    text: AppColorScheme.light.text,
    background: AppColorScheme.light.background,
    tint: tintColorLight,
    icon: AppColorScheme.light.muted,
    tabIconDefault: AppColorScheme.light.muted,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: AppColorScheme.dark.text,
    background: AppColorScheme.dark.background,
    tint: tintColorDark,
    icon: AppColorScheme.dark.muted,
    tabIconDefault: AppColorScheme.dark.muted,
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
