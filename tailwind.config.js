/** @type {import('tailwindcss').Config} */
const appTheme = require("./src/constants/theme.json");

module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: appTheme.color.paper,
        foreground: appTheme.color.ink,
        muted: appTheme.color.mutedInk,
        border: appTheme.color.ink,
        card: appTheme.color.panel,
        primary: appTheme.color.red,
        secondary: appTheme.color.ink,
        tertiary: appTheme.color.yellow,
        accent: appTheme.color.red,
        accentForeground: appTheme.color.paper,
        paper: appTheme.color.paper,
        panel: appTheme.color.panel,
        panelMuted: appTheme.color.panelMuted,
        imageBase: appTheme.color.imageBase,
        caution: appTheme.color.yellow,
        danger: appTheme.color.red,
        signalBlue: appTheme.color.blue,
        signalBlueSoft: appTheme.color.blueSoft,
      },
      borderRadius: {
        xl: "4px",
        "2xl": "8px",
        "3xl": "12px",
      },
    },
  },
  plugins: [],
};
