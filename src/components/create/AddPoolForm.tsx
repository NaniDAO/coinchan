import { TokenMetadata } from "@/lib/pools";
import { Label } from "../ui/label";
import { useGetTokens } from "@/hooks/use-get-tokens";
import { useAccount } from "wagmi";
import { FeeOrHookSelector } from "../pools/FeeOrHookSelector";
import { useMemo } from "react";
import { TokenAmountInput } from "../pools/TokenAmountInput";
import { Slider } from "../ui/slider";

interface AddPoolFormProps {
  poolPct: number;
  setPoolPct: (value: number) => void;
  poolSupplyTokens: number;
  creatorSupplyTokens: number;
  tokenA: TokenMetadata;
  onSelectTokenA: (value: TokenMetadata) => void;
  tokenB: TokenMetadata;
  amountIn: string;
  setAmountIn: (value: string) => void;
  feeOrHook: bigint;
  setFeeOrHook: (value: bigint) => void;
  isHook: boolean;
}

export const AddPoolForm = ({
  poolPct,
  setPoolPct,
  poolSupplyTokens,
  creatorSupplyTokens,
  tokenA,
  onSelectTokenA,
  tokenB,
  amountIn,
  setAmountIn,
  feeOrHook,
  setFeeOrHook,
  isHook,
}: AddPoolFormProps) => {
  const { address: owner } = useAccount();
  const { data: tokens } = useGetTokens(owner);

  const tokensWithTokenB = useMemo(() => {
    return [...(tokens ?? []), tokenB];
  }, [tokens, tokenB]);

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div>
        <div className="text-sm font-medium">Pool settings</div>
        <p className="text-xs text-muted-foreground">
          We’ll mint your token, then create and seed a pool.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="poolPct">Pool allocation (%)</Label>
          <Slider
            id="poolPct"
            min={0}
            max={100}
            step={1}
            defaultValue={[90]}
            value={[poolPct]}
            onValueChange={(vals) => setPoolPct(vals[0])}
          />

          <p className="text-xs text-muted-foreground">
            {poolSupplyTokens.toLocaleString()} to pool •{" "}
            {creatorSupplyTokens.toLocaleString()} to creator
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <TokenAmountInput
          amount={amountIn}
          onAmountChange={(amount) => setAmountIn(amount.toString())}
          onTokenSelect={onSelectTokenA}
          token={tokenA}
          tokens={tokensWithTokenB}
          className="mb-1 w-full"
        />
        <TokenAmountInput
          amount={poolSupplyTokens.toString()}
          onAmountChange={() => {}}
          onTokenSelect={() => {}}
          token={tokenB}
          tokens={tokensWithTokenB}
          locked={true}
          className="mb-1 w-full"
        />
      </div>
      <FeeOrHookSelector
        feeOrHook={feeOrHook}
        setFeeOrHook={setFeeOrHook}
        isHook={isHook}
      />
    </div>
  );
};
