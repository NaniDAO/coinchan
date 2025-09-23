import { TradeView } from "@/TradeView";
import AiMetaCard from "@/components/AiMetaCard";
import { CoinBreadcrumb } from "@/components/CoinBreadcrumb";
import { ErrorAlert } from "@/components/ErrorAlert";
import { UnifiedCoinView } from "@/components/UnifiedCoinView";
import { CoinsAddress } from "@/constants/Coins";
import { CookbookAddress } from "@/constants/Cookbook";
import { isCookbookCoin } from "@/lib/coin-utils";
import { ZAMMError } from "@/lib/errors";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/c/$coinId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { coinId } = Route.useParams();

  const isCookbook = isCookbookCoin(coinId);
  const token = isCookbook ? CookbookAddress : CoinsAddress;

  if (isCookbook === null) {
    return (
      <div className="min-h-[90vh] w-screen flex items-center justify-center">
        <ErrorAlert
          error={
            new ZAMMError({
              name: "Invalid coin ID",
              message: "The provided coin ID is not valid.",
            })
          }
          className="max-w-lg"
        >
          <Link
            className="w-flex flex-row items-center hover:underline justify-center text-secondary-foreground"
            to="/explore/tokens"
          >
            Go to token explorer
          </Link>
        </ErrorAlert>
      </div>
    );
  }

  return (
    <div aria-label={t("coin.price")}>
      <CoinBreadcrumb coinId={BigInt(coinId)} />
      <AiMetaCard id={coinId} address={token} />
      {isCookbook ? (
        <UnifiedCoinView coinId={BigInt(coinId)} />
      ) : (
        <TradeView tokenId={BigInt(coinId)} />
      )}
    </div>
  );
}
