import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useTranslation } from "react-i18next";
import { Logo } from "./Logo";
import { useZCurveSale } from "@/hooks/use-zcurve-sale";
import { Link } from "@tanstack/react-router";

export const CoinBreadcrumb = ({ coinId }: { coinId: bigint }) => {
  const { t } = useTranslation();
  const { data: zcurveSale } = useZCurveSale(coinId.toString());

  return (
    <div className="flex items-center px-6 py-2 gap-2">
      {/* Back button for zCurve sales */}
      {zcurveSale && (
        <Link
          to="/explore/bonded-coins"
          className="flex items-center mr-2 px-2 py-1 -ml-2 rounded-md hover:bg-accent hover:text-accent-foreground active:scale-95 transition-all duration-200 touch-manipulation"
          title={t("navigation.back_to_coins", "Back to Coins")}
        >
          <span className="text-xl font-mono">&lt;</span>
        </Link>
      )}

      <Breadcrumb>
        <BreadcrumbList className="flex items-center">
          <BreadcrumbItem>
            <BreadcrumbLink href="/">
              <Logo className="p-0 m-0" />
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <span className="text-muted-foreground mx-2">&gt;</span>
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbLink href="/explore">{t("common.coins")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <span className="text-muted-foreground mx-2">&gt;</span>
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage>{coinId.toString()}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
};
