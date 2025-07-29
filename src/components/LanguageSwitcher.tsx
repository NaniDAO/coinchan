import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  // Normalize language code to handle cases like "en-US" -> "en"
  const currentLanguage = i18n.language.split('-')[0];

  // Toggle language handler
  const toggleLanguage = () => {
    const newLang = currentLanguage === "en" ? "zh" : "en";
    i18n.changeLanguage(newLang);
  };

  // Get opposite language label (what user will switch to)
  const getOppositeLanguageLabel = () => {
    // Always show the opposite language label
    if (currentLanguage === "en") {
      return "中文"; // Show Chinese when in English
    } else {
      return "English"; // Show English when in Chinese
    }
  };

  return (
    <button
      onClick={toggleLanguage}
      className="px-3 py-1 text-sm bg-background text-foreground border border-foreground rounded hover:bg-foreground hover:text-background transition-colors"
      aria-label={`Switch language to ${currentLanguage === "en" ? "中文" : "English"}`}
    >
      {getOppositeLanguageLabel()}
    </button>
  );
}

export default LanguageSwitcher;
