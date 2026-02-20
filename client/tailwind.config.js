/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* ── Semantic surface tokens (CSS-var driven for dark/light) ── */
        surface: {
          base:     'var(--surface-base)',
          DEFAULT:  'var(--surface-default)',
          elevated: 'var(--surface-elevated)',
          card:     'var(--surface-card)',
        },
        /* ── Brand purple accent ── */
        accent: {
          DEFAULT: 'var(--accent)',
          hover:   'var(--accent-hover)',
          muted:   'var(--accent-muted)',
          subtle:  'var(--accent-subtle)',
        },
        /* ── Text tokens ── */
        txt: {
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted:     'var(--text-muted)',
          inverse:   'var(--text-inverse)',
        },
        /* ── Border tokens ── */
        border: {
          DEFAULT: 'var(--border-default)',
          subtle:  'var(--border-subtle)',
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '10px',
      },
      boxShadow: {
        glow: '0 0 20px rgba(139, 92, 246, 0.15)',
        'glow-lg': '0 0 40px rgba(139, 92, 246, 0.2)',
        'inner-glow': 'inset 0 1px 1px rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'glass': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
        'accent-gradient': 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
        'accent-gradient-hover': 'linear-gradient(135deg, #a78bfa, #7c3aed)',
      },
    },
  },
  plugins: [],
};
