/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#f8fafc',
        foreground: '#0f172a',
        muted: '#64748b',
        border: '#cbd5e1',
        card: '#ffffff',
        primary: '#ea580c',
        secondary: '#0f172a',
        tertiary: '#2563eb',
        accent: '#ea580c',
        accentForeground: '#fff7ed',
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
};
