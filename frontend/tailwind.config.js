/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["'Geist Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // Surface / base
        app:      '#F5F5F1',
        surface:  '#FFFFFF',
        ink:      '#0B0E14',
        ink2:     '#4A4E5A',
        ink3:     '#8A8E99',
        line:     '#E8E6DE',
        // Accents
        primary:    { DEFAULT: '#2F4BFF', soft: '#E6EAFF', on: '#FFFFFF' },
        lime:       { DEFAULT: '#D8F26A', ink: '#24300A' },
        coral:      { DEFAULT: '#FF8068', soft: '#FFE4DC', deep: '#C24A30' },
        violet:     { DEFAULT: '#A58BFF', soft: '#ECE4FF', deep: '#5C3FD6' },
        mint:       { DEFAULT: '#9DE8C8', soft: '#DFF6EB', deep: '#1F6F4C' },
        amber:      { DEFAULT: '#FFC657', soft: '#FFF4D6', deep: '#8A5B10' },
        // Kept from previous theme so old components don't break
        brand: {
          50: '#edf3ff', 100: '#dce8ff', 300: '#a9c4ff', 400: '#89adff',
          500: '#6a96ff', 600: '#4f7fea', 700: '#3d67c7',
        },
      },
      borderRadius: {
        card: '22px',
        inner: '14px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,14,20,0.04)',
        hero: '0 12px 30px rgba(11,14,20,0.12)',
        pill: '0 4px 20px rgba(11,14,20,0.06)',
      },
      letterSpacing: {
        tightest: '-0.8px',
      },
    },
  },
  plugins: [],
};
