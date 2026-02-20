import React from 'react';
import { Sun, Moon } from 'lucide-react';
import useThemeStore from '../../stores/themeStore';

export default function ThemeToggle({ compact = false }) {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';

  if (compact) {
    return (
      <button
        onClick={toggleTheme}
        aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
        className="w-8 h-8 flex items-center justify-center rounded-xl transition-all duration-200
                   hover:bg-[var(--accent-muted)]"
        style={{ color: 'var(--text-secondary)' }}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      className="relative flex items-center w-14 h-7 rounded-full transition-all duration-300 cursor-pointer"
      style={{
        background: isDark
          ? 'linear-gradient(135deg, #1e1b3a, #2d2a4a)'
          : 'linear-gradient(135deg, #e0d4f5, #f0eef8)',
        border: '1px solid var(--border-default)',
      }}
    >
      <span
        className="absolute w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 shadow-md"
        style={{
          left: isDark ? '4px' : '33px',
          background: isDark
            ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)'
            : 'linear-gradient(135deg, #f59e0b, #f97316)',
        }}
      >
        {isDark ? (
          <Moon size={10} className="text-white" />
        ) : (
          <Sun size={10} className="text-white" />
        )}
      </span>
    </button>
  );
}
