import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const currentLanguage = i18n.language;

  // Languages supported
  const languages = [
    { code: "en", label: "English" },
    { code: "zh", label: "中文" },
  ];

  // Toggle language handler
  const toggleLanguage = () => {
    const newLang = currentLanguage === "en" ? "zh" : "en";
    i18n.changeLanguage(newLang);
  };

  // Get current language label
  const getCurrentLanguageLabel = () => {
    const lang = languages.find(l => l.code === currentLanguage);
    return lang ? lang.label : "English";
  };

  return (
    <button
      onClick={toggleLanguage}
      className="px-3 py-1 text-sm bg-background text-foreground border border-foreground rounded hover:bg-foreground hover:text-background transition-colors"
      aria-label={`Switch language to ${currentLanguage === "en" ? "中文" : "English"}`}
    >
      {getCurrentLanguageLabel()}
    </button>
  );
}

export default LanguageSwitcher;
