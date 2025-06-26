import { useTheme } from "@/lib/theme";
import { useTranslation } from "react-i18next";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <button onClick={toggleTheme} className="px-2 flex items-center gap-1 hover:scale-110 focus:115">
      {theme === "light" ? (
        <>
          <span className="text-sm">🌙</span>
          <span className="sr-only">{t("common.dark")}</span>
        </>
      ) : (
        <>
          <span className="text-sm">☀️</span>
          <span className="sr-only">{t("common.light")}</span>
        </>
      )}
    </button>
  );
}
