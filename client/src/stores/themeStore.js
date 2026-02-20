import { create } from 'zustand';

// Force dark mode — no toggle
document.documentElement.classList.remove('light');
document.documentElement.classList.add('dark');

const useThemeStore = create(() => ({
  theme: 'dark',
}));

export default useThemeStore;
