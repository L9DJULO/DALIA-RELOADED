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
          glass:    'var(--surface-glass)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover:   'var(--accent-hover)',
          muted:   'var(--accent-muted)',
          subtle:  'var(--accent-subtle)',
          glow:    'var(--accent-glow)',
        },
        txt: {
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted:     'var(--text-muted)',
          inverse:   'var(--text-inverse)',
        },
        border: {
          DEFAULT:  'var(--border-default)',
          subtle:   'var(--border-subtle)',
          accent:   'var(--border-accent)',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '12px',
        'sm': '8px',
        'lg': '16px',
        'xl': '20px',
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0, 0, 0, 0.25)',
        'DEFAULT': '0 2px 8px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
        'md': '0 4px 12px rgba(0, 0, 0, 0.3)',
        'lg': '0 8px 24px rgba(0, 0, 0, 0.35)',
        'xl': '0 16px 48px rgba(0, 0, 0, 0.4)',
        'glow': '0 0 24px var(--accent-glow)',
        'glow-lg': '0 0 40px var(--accent-glow)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      backdropBlur: {
        xs: '4px',
      },
      spacing: {
        '18': '4.5rem',
      },
    },
  },
  plugins: [],
};
