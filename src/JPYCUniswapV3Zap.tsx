import { useTranslation } from "react-i18next";

export const JPYCUniswapV3Zap = () => {
  const { t } = useTranslation();

  return (
    <div className="text-center py-8 text-muted-foreground">
      <p>{t("jpyc.v3_zap_coming_soon")}</p>
      <p className="text-sm mt-2">{t("jpyc.use_direct_route")}</p>
    </div>
  );
};
