import { create } from 'zustand';

const THEMES = {
  dark: {
    label: 'Sombre',
    class: 'dark',
  },
  light: {
    label: 'Clair',
    class: 'light',
  },
};

function getInitialTheme() {
  const stored = localStorage.getItem('dalia-theme');
  if (stored && THEMES[stored]) return stored;
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(THEMES[theme].class);
  localStorage.setItem('dalia-theme', theme);
}

// Apply on load
applyTheme(getInitialTheme());

const useThemeStore = create((set, get) => ({
  theme: getInitialTheme(),
  themes: THEMES,

  setTheme: (theme) => {
    if (!THEMES[theme]) return;
    applyTheme(theme);
    set({ theme });
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ theme: next });
  },
}));

export default useThemeStore;
