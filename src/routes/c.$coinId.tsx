import { CookbookCoinView } from "@/components/CookbookCoinView";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TradeView } from "@/TradeView";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/c/$coinId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { coinId } = Route.useParams();

  if (isNaN(Number(coinId))) {
    return (
      <Alert className="p-2 max-w-2xl mt-2 ml-2">
        <AlertTitle>Invalid Coin ID</AlertTitle>
        <AlertDescription>Looks</AlertDescription>
      </Alert>
    );
  }

  const isCookbook = coinId.toString().length < 49;

  if (isCookbook) {
    return (
      <div>
        <CookbookCoinView coinId={BigInt(coinId)} />
      </div>
    );
  }

  // Apply translation to coin view
  return (
    <div aria-label={t("coin.price")}>
      <TradeView tokenId={BigInt(coinId)} />
    </div>
  );
}
