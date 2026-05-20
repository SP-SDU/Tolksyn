/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#f5f0e8',
        foreground: '#1a1a1a',
        muted: '#5f5a52',
        border: '#1a1a1a',
        card: '#e8e3da',
        primary: '#cf2f25',
        secondary: '#1a1a1a',
        tertiary: '#ffcc00',
        accent: '#cf2f25',
        accentForeground: '#f5f0e8',
        paper: '#f5f0e8',
        panel: '#e8e3da',
        panelMuted: '#e2ddd4',
        imageBase: '#d6d1c9',
        caution: '#ffcc00',
        danger: '#cf2f25',
        signalBlue: '#0055ff',
        signalBlueSoft: '#d6e3ff',
      },
      borderRadius: {
        xl: '4px',
        '2xl': '8px',
        '3xl': '12px',
      },
    },
  },
  plugins: [],
};
