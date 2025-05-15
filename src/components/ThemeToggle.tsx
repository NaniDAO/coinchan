import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      className="px-2 flex items-center gap-1"
    >
      {theme === 'light' ? (
        <>
          <span className="text-sm">🌙</span>
          <span>Dark</span>
        </>
      ) : (
        <>
          <span className="text-sm">☀️</span>
          <span>Light</span>
        </>
      )}
    </Button>
  );
}