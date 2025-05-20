import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button onClick={toggleTheme} className="px-2 flex items-center gap-1 hover:scale-110 focus:115">
      {theme === "light" ? (
        <>
          <span className="text-sm">🌙</span>
          <span className="sr-only">Dark</span>
        </>
      ) : (
        <>
          <span className="text-sm">☀️</span>
          <span className="sr-only">Light</span>
        </>
      )}
    </button>
  );
}
