import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme";
import { useTranslation } from "react-i18next";

export function UserSettingsMenu() {
  const { toggleTheme } = useTheme();
  const { i18n } = useTranslation();
  const currentLanguage = i18n.language;

  const languages = [
    { code: "en", label: "English" },
    { code: "zh", label: "中文" },
  ];

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="!p-2 flex items-center justify-center hover:scale-110 focus:scale-115 focus:outline-none">
        <span className="text-lg">ⓘ</span>
        <span className="sr-only">User Settings</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-48">
        <DropdownMenuLabel className="!px-2 !py-1 bg-foreground text-background !border !border-background">
          Settings
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="!px-2 !py-1 bg-background text-foreground !border !border-foreground">
            <span>Language</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {languages.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                className="!px-2 !py-1 bg-background text-foreground !border !border-foreground"
                onClick={() => changeLanguage(lang.code)}
              >
                <span
                  className={currentLanguage === lang.code ? "font-bold" : ""}
                >
                  {lang.label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem
          className="!px-2 !py-1 bg-background text-foreground !border !border-foreground"
          onClick={toggleTheme}
        >
          Theme
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserSettingsMenu;
