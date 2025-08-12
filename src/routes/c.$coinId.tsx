import { TradeView } from "@/TradeView";
import AiMetaCard from "@/components/AiMetaCard";
import { CoinBreadcrumb } from "@/components/CoinBreadcrumb";
import { UnifiedCoinView } from "@/components/UnifiedCoinView";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { CoinsAddress } from "@/constants/Coins";
import { CookbookAddress } from "@/constants/Cookbook";
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
        <AiMetaCard id={coinId} address={CookbookAddress} />
        <UnifiedCoinView coinId={BigInt(coinId)} />
      </div>
    );
  } else {
    display = (
      <div>
        <AiMetaCard id={coinId} address={CoinsAddress} />
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
