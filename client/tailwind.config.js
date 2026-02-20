/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          base:     'var(--surface-base)',
          DEFAULT:  'var(--surface-default)',
          elevated: 'var(--surface-elevated)',
          card:     'var(--surface-card)',
          overlay:  'var(--surface-overlay)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover:   'var(--accent-hover)',
          muted:   'var(--accent-muted)',
          subtle:  'var(--accent-subtle)',
        },
        txt: {
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted:     'var(--text-muted)',
          inverse:   'var(--text-inverse)',
        },
        border: {
          DEFAULT: 'var(--border-default)',
          subtle:  'var(--border-subtle)',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '10px',
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0, 0, 0, 0.2)',
        'DEFAULT': '0 1px 3px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15)',
        'md': '0 4px 6px rgba(0, 0, 0, 0.2)',
        'lg': '0 10px 15px rgba(0, 0, 0, 0.25)',
      },
    },
  },
  plugins: [],
};
