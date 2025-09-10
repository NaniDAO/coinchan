import { useState } from "react";

import { useTokenPair } from "@/hooks/use-token-pair";
import { TradeController } from "./TradeController";
import { TradePanel } from "./TradePanel";
import { useGetTokens } from "@/hooks/use-get-tokens";
import { cn } from "@/lib/utils";
import { FlipActionButton } from "../FlipActionButton";
import { ETH_TOKEN, TokenMetadata, ZAMM_TOKEN } from "@/lib/pools";

interface InstantTradeActionProps {
  locked?: boolean;
}

export const InstantTradeAction = ({
  locked = false,
}: InstantTradeActionProps) => {
  const { sellToken, setSellToken, buyToken, setBuyToken, flip } = useTokenPair(
    {
      initial: {
        sellToken: ETH_TOKEN,
        buyToken: ZAMM_TOKEN,
      },
    },
  );
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [lastEditedField, setLastEditedField] = useState<"sell" | "buy">(
    "sell",
  );

  const { data: tokens } = useGetTokens();

  const syncFromSell = () => {};
  const handleSellTokenSelect = (token: TokenMetadata) => {};
  const syncFromBuy = () => {};
  const handleBuyTokenSelect = (token: TokenMetadata) => {};

  console.log("Sell Token, BuyToken:", {
    sellToken,
    buyToken,
  });
  return (
    <div>
      <TradeController
        onAmountChange={(sellAmount) => {
          setSellAmount(sellAmount);
          setLastEditedField("sell");
        }}
        currentSellToken={sellToken}
        setSellToken={setSellToken}
        currentBuyToken={buyToken}
        setBuyToken={setBuyToken}
        currentSellAmount={sellAmount}
        setSellAmount={setSellAmount}
        className="rounded-md"
        ariaLabel="Trade Controller"
      />

      {/* SELL / FLIP / BUY */}
      <div className="relative flex flex-col">
        <TradePanel
          title={"Sell"}
          selectedToken={sellToken}
          tokens={tokens ?? []}
          onSelect={handleSellTokenSelect}
          amount={sellAmount}
          onAmountChange={syncFromSell}
          showMaxButton={
            sellToken && sellToken.balance && BigInt(sellToken.balance) > 0n
              ? true
              : false
          }
          onMax={() => {
            // if (sellToken.id === null) {
            //   const ethAmount = ((sellToken.balance as bigint) * 99n) / 100n;
            //   syncFromSell(formatEther(ethAmount));
            // } else {
            //   const decimals = sellToken.decimals || 18;
            //   syncFromSell(formatUnits(sellToken.balance as bigint, decimals));
            // }
          }}
          showPercentageSlider={
            sellToken &&
            !!sellToken.balance &&
            (sellToken.balance as bigint) > 0n
          }
          className="pb-4 rounded-t-2xl"
          readOnly={locked}
        />
        <div
          className={cn("absolute left-1/2 -translate-x-1/2 top-[50%] z-10")}
        >
          <FlipActionButton onClick={flip} />
        </div>
        <TradePanel
          title={"Buy"}
          selectedToken={buyToken ?? undefined}
          tokens={tokens ?? []}
          onSelect={handleBuyTokenSelect}
          amount={buyAmount}
          onAmountChange={syncFromBuy}
          className="pt-4 rounded-b-2xl"
          readOnly={locked}
        />
      </div>
    </div>
  );
};
