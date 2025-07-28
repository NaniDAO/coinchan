import { TradeView } from "@/TradeView";
import { CoinBreadcrumb } from "@/components/CoinBreadcrumb";
import { UnifiedCoinView } from "@/components/UnifiedCoinView";
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

  let display;
  if (isNaN(Number(coinId))) {
    display = (
      <Alert className="p-2 max-w-2xl mt-2 ml-2">
        <AlertTitle>Invalid Coin ID</AlertTitle>
      </Alert>
    );
  }

  const isCookbook = isCookbookCoin(BigInt(coinId ?? "0"));
  if (isCookbook) {
    display = (
      <div>
        <UnifiedCoinView coinId={BigInt(coinId)} />
      </div>
    );
  } else {
    display = (
      <div>
        <TradeView tokenId={BigInt(coinId)} />
      </div>
    );
  }

  return (
    <div aria-label={t("coin.price")}>
      <CoinBreadcrumb coinId={BigInt(coinId)} />
      {display}
    </div>
  );
}
