import * as React from "react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { useDarkMode } from "@/hooks/use-dark-mode";

export function ThemeToggle({ className }: { className?: string }) {
  const { isDarkMode: isDark, toggleDarkMode: toggleTheme } = useDarkMode();

  const buttonStyle = {
    backgroundColor: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.08)",
    borderRadius: "50%",
    width: "42px",
    height: "42px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.3s ease",
    boxShadow: isDark 
      ? "0 0 10px rgba(255, 255, 255, 0.2), 0 0 20px rgba(255, 255, 255, 0.1)" 
      : "0 0 10px rgba(0, 0, 0, 0.15), 0 0 20px rgba(0, 0, 0, 0.05)"
  };

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "flex items-center justify-center transition-all duration-300 ease-in-out",
        "hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary",
        className
      )}
      style={buttonStyle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <div className="relative w-5 h-5">
        <div
          className={cn(
            "absolute inset-0 transform transition-opacity duration-300",
            isDark ? "opacity-100" : "opacity-0"
          )}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        </div>
        <div
          className={cn(
            "absolute inset-0 transform transition-opacity duration-300",
            isDark ? "opacity-0" : "opacity-100"
          )}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </div>
      </div>
    </button>
  );
}