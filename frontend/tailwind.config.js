/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // LoL-inspired dark palette
        dalia: {
          bg:      '#0a0e14',
          surface: '#111927',
          card:    '#1a2332',
          border:  '#2a3a4d',
          accent:  '#c8aa6e',    // gold
          blue:    '#0397ab',
          red:     '#c24b4b',
          green:   '#2dbd6e',
          purple:  '#9b59b6',
          text:    '#cdd6e0',
          muted:   '#6b7a8d',
        },
      },
      fontFamily: {
        display: ['"Beaufort for LOL"', 'Georgia', 'serif'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
