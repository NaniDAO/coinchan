import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function UserSettingsMenu() {
  const { toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { i18n, t } = useTranslation();
  // Normalize language code to handle cases like "en-US" -> "en"
  const currentLanguage = i18n.language.split("-")[0];

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
  };

  const toggleLanguage = () => {
    const newLang = currentLanguage === "en" ? "zh" : "en";
    changeLanguage(newLang);
  };

  const getOppositeLanguageLabel = () => {
    // Always show the opposite language label
    if (currentLanguage === "en") {
      return "中文"; // Show Chinese when in English
    } else {
      return "English"; // Show English when in Chinese
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="!p-2 flex items-center justify-center hover:scale-110 focus:scale-115 focus:outline-none">
        <span className="text-lg">ⓘ</span>
        <span className="sr-only">{t("common.settings")}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-48">
        <DropdownMenuLabel className="!px-2 !py-1 bg-foreground text-background !border !border-background">
          {t("common.settings")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="!px-2 !py-1 bg-background text-foreground !border !border-foreground"
          onClick={toggleLanguage}
        >
          {getOppositeLanguageLabel()}
        </DropdownMenuItem>

        <DropdownMenuItem
          className="!px-2 !py-1 bg-background text-foreground !border !border-foreground"
          onClick={toggleTheme}
        >
          {t("common.theme")}
        </DropdownMenuItem>

        <DropdownMenuItem
          className="!px-2 !py-1 bg-background text-foreground !border !border-foreground"
          onClick={() => (window.location.href = "/user")}
        >
          {t("common.user")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="!px-2 !py-1 bg-background text-foreground !border !border-foreground"
          onClick={() => navigate({ to: "/about" })}
        >
          {t("common.about")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserSettingsMenu;
