/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /* ── Semantic surface tokens ── */
        surface: {
          base: '#020617',      /* slate-950 — app background */
          DEFAULT: '#0f172a',   /* slate-900 — panels, sidebar */
          elevated: '#1e293b',  /* slate-800 — cards, inputs, interactive */
        },
        accent: {
          DEFAULT: '#f59e0b',   /* amber-500 */
          hover: '#fbbf24',     /* amber-400 */
          muted: 'rgba(245,158,11,0.15)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
      },
    },
  },
  plugins: [],
};
