/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#edf3ff',
          100: '#dce8ff',
          300: '#a9c4ff',
          400: '#89adff',
          500: '#6a96ff',
          600: '#4f7fea',
          700: '#3d67c7',
        },
      },
    },
  },
  plugins: [],
};
