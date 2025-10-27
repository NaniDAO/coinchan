import { useTranslation } from "react-i18next";

export const JpycFarmTab = () => {
  const { t } = useTranslation();

  return (
    <div className="text-center py-8 text-muted-foreground">
      <p>{t("jpyc.farming_coming_soon")}</p>
      <p className="text-sm mt-2">{t("jpyc.check_back_later")}</p>
    </div>
  );
};
