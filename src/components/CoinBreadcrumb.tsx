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
          to="/sales" 
          className="flex items-center hover:text-primary transition-colors mr-2"
          title={t("navigation.back_to_sales", "Back to Sales")}
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
