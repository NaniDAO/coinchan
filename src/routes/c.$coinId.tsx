import { TradeView } from "@/TradeView";
import { CookbookCoinView } from "@/components/CookbookCoinView";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { isCookbookCoin } from "@/lib/coin-utils";
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
      </Alert>
    );
  }

  const isCookbook = isCookbookCoin(BigInt(coinId ?? "0"));
  if (isCookbook) {
    return (
      <div>
        <CookbookCoinView coinId={BigInt(coinId)} />
      </div>
    );
  }

  return (
    <div aria-label={t("coin.price")}>
      <TradeView tokenId={BigInt(coinId)} />
    </div>
  );
}
