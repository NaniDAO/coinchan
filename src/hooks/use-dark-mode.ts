import { useState, useEffect } from 'react';

export function useDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      // Check for user preference in localStorage
      const storedPreference = localStorage.getItem('coinchan-dark-mode');
      if (storedPreference !== null) {
        return storedPreference === 'true';
      }
      
      // Check if the document has a dark class
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  useEffect(() => {
    const darkModeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class'
        ) {
          const isDark = document.documentElement.classList.contains('dark');
          setIsDarkMode(isDark);
        }
      });
    });

    darkModeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      darkModeObserver.disconnect();
    };
  }, []);

  // Toggle function
  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    
    if (newDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('coinchan-dark-mode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('coinchan-dark-mode', 'false');
    }
    
    setIsDarkMode(newDarkMode);
  };

  return { isDarkMode, toggleDarkMode };
}