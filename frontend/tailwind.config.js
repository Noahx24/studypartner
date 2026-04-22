/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0b0b0d',
        panel: '#121217',
        muted: '#a1a1aa',
      },
    },
  },
  plugins: [],
};
