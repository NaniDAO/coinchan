import React, { useState, useEffect } from 'react';

// Define available themes - extensible for future themes
export type ThemeMode = 'light' | 'dark' | string;

// Simple theme hooks approach
export function useTheme() {
  const [theme, setInternalTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      if (document.documentElement.classList.contains('dark')) {
        return 'dark';
      }
      return localStorage.getItem('theme') || 'light';
    }
    return 'light';
  });

  const setTheme = (newTheme: ThemeMode) => {
    if (typeof window === 'undefined') return;
    
    // Update DOM
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Save to localStorage
    localStorage.setItem('theme', newTheme);
    
    // Update state
    setInternalTheme(newTheme);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  return { theme, setTheme, toggleTheme };
}

// Simple provider that doesn't use context - just for compatibility
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}