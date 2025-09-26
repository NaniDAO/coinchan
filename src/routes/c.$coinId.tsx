import { createFileRoute, redirect } from "@tanstack/react-router";
import { isCookbookCoin } from "@/lib/coin-utils";
import { CoinsAddress } from "@/constants/Coins";
import { CookbookAddress } from "@/constants/Cookbook";

export const Route = createFileRoute("/c/$coinId")({
  beforeLoad: ({ params }) => {
    const coinId = params.coinId;
    const isCookbook = isCookbookCoin(coinId);

    if (isCookbook === null) {
      throw redirect({
        to: "/explore/tokens",
        replace: true,
      });
    }

    const address = isCookbook ? CookbookAddress : CoinsAddress;

    // Forward to /explore/token with search params
    throw redirect({
      to: "/explore/token",
      search: { address, id: coinId },
      replace: true,
    });
  },
});
