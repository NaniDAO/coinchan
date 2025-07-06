import confetti from "canvas-confetti";
import { useState, useEffect, useMemo } from "react";
import { CoinchanAbi, CoinchanAddress } from "./constants/Coinchan";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { parseEther } from "viem";
import { pinImageToPinata, pinJsonToPinata } from "@/lib/pinata";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import { formatNumber } from "./lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { mainnet } from "viem/chains";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  CheckTheChainAbi,
  CheckTheChainAddress,
} from "./constants/CheckTheChain";
import { ImageInput } from "./components/ui/image-input";
import { CoinPreview } from "./components/CoinPreview";
import { computeCoinId } from "./lib/coins";
import { usePrice } from "./hooks/use-price";

export function CoinForm() {
  const { t } = useTranslation();
  const [formState, setFormState] = useState({
    name: "",
    symbol: "",
    description: "",
    logo: "",
    creatorSupply: "0",
    ethAmount: "0.01", // Default ETH amount
  });

  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { address } = useAccount();

  const TOTAL_SUPPLY = 21000000;
  const [poolSupply, setPoolSupply] = useState(TOTAL_SUPPLY);
  const [swapFee, setSwapFee] = useState(100); // Default 1% fee (represented as basis points)
  const [customFeeInput, setCustomFeeInput] = useState("");
  const [showFeeSelector, setShowFeeSelector] = useState(false);
  const vestingDuration = 15778476;
  const vesting = true;

  // Fetch ETH price in USD from CheckTheChain
  const { data: ethPriceData } = usePrice({ ticker: "WETH" });

  // Calculate estimated market cap
  // Convert fee basis points to percentage string
  const feeToPercentage = (basisPoints: number): string => {
    return (basisPoints / 100).toFixed(2) + "%";
  };

  // Convert percentage to basis points
  const percentageToBasisPoints = (percentage: number): number => {
    return Math.round(percentage * 100);
  };

  // Format percentage input to have max 2 decimal places and be within valid range
  const formatPercentageInput = (value: string): string => {
    // Handle empty or invalid input
    if (!value || isNaN(parseFloat(value))) return "";

    // Parse the value
    let numValue = parseFloat(value);

    // Cap the value at 99.99
    numValue = Math.min(numValue, 99.99);

    // If input contains more than 2 decimal places, truncate to 2
    if (value.includes(".") && value.split(".")[1].length > 2) {
      return numValue.toFixed(2);
    }

    // If we've capped the value, use the fixed format
    if (numValue !== parseFloat(value)) {
      return numValue.toFixed(2);
    }

    return value;
  };

  const marketCapEstimation = useMemo(() => {
    if (!ethPriceData) return null;

    // Parse ETH price from the data
    const priceStr = ethPriceData[1];
    const ethPriceUsd = parseFloat(priceStr);

    // Check if parsing was successful
    if (isNaN(ethPriceUsd) || ethPriceUsd === 0) return null;

    // Get ETH amount (reserve0) and token amount (reserve1)
    const ethAmount = parseFloat(formState.ethAmount) || 0.01;

    // In a XYK pool (x*y=k), the spot price is determined by the ratio of reserves
    // For ETH to token swap, price = reserve_token / reserve_eth
    // Initial token price in ETH = ethAmount / poolSupply
    const initialTokenPriceInEth = ethAmount / poolSupply;

    // Market cap calculation for initial offering
    // Total fully diluted value = initialTokenPriceInEth * TOTAL_SUPPLY
    const marketCapEth = initialTokenPriceInEth * TOTAL_SUPPLY;

    // Market cap in USD
    const marketCapUsd = marketCapEth * ethPriceUsd;

    // Token price in USD
    const tokenPriceUsd = initialTokenPriceInEth * ethPriceUsd;

    return {
      eth: marketCapEth,
      usd: marketCapUsd,
      tokenPriceUsd: tokenPriceUsd,
    };
  }, [ethPriceData, formState.ethAmount, poolSupply]);

  useEffect(() => {
    const creatorAmount = Number(formState.creatorSupply) || 0;
    const safeCreatorAmount = Math.min(creatorAmount, TOTAL_SUPPLY);
    setPoolSupply(TOTAL_SUPPLY - safeCreatorAmount);
  }, [formState.creatorSupply]);

  const { writeContract, isPending, isSuccess, data, error } =
    useWriteContract();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!address || !imageBuffer) {
      // Error will be shown in UI
      setErrorMessage(
        !address ? t("errors.wallet_connection") : t("create.upload_image"),
      );
      return;
    }

    // Validate ETH amount
    const ethAmount = Number(formState.ethAmount);
    if (isNaN(ethAmount) || ethAmount <= 0) {
      setErrorMessage(t("errors.invalid_amount"));
      return;
    }

    // Validate creator supply
    const creatorSupplyValue = Number(formState.creatorSupply) || 0;
    if (creatorSupplyValue > TOTAL_SUPPLY) {
      setErrorMessage(t("errors.insufficient_balance"));
      return;
    }

    // Calculate final pool supply
    const safeCreatorSupply = Math.min(creatorSupplyValue, TOTAL_SUPPLY);
    const finalPoolSupply = TOTAL_SUPPLY - safeCreatorSupply;

    try {
      const fileName = `${formState.name}_logo.png`;
      const pinataMetadata = { name: fileName };

      const imageHash = await pinImageToPinata(
        imageBuffer,
        fileName,
        pinataMetadata,
      );

      const tokenUriJson = {
        name: formState.name,
        symbol: formState.symbol,
        description: formState.description,
        image: imageHash,
      };

      const tokenUriHash = await pinJsonToPinata(tokenUriJson);

      try {
        // Use custom ETH amount from form or default to 0.01 if invalid
        const ethAmount =
          formState.ethAmount && !isNaN(Number(formState.ethAmount))
            ? formState.ethAmount
            : "0.01";

        writeContract({
          address: CoinchanAddress,
          abi: CoinchanAbi,
          functionName: "makeLocked",
          value: parseEther(ethAmount),
          args: [
            formState.name,
            formState.symbol,
            tokenUriHash,
            parseEther(finalPoolSupply.toString()),
            parseEther(safeCreatorSupply.toString()),
            BigInt(swapFee), // Uses the custom fee from state
            address,
            BigInt(Math.floor(Date.now() / 1000) + vestingDuration),
            vesting,
          ],
        });

        // Show confetti only if the transaction was successful
        if (!isUserRejectionError(error)) {
          confetti({
            particleCount: 666,
            spread: 666,
            scalar: 0.9,
            shapes: ["circle"],
            gravity: 0.9,
            colors: ["#f9bd20", "#c17a00", "#fff9e6"],
          });
        }
      } catch (txError) {
        // Handle wallet rejection silently
        if (!isUserRejectionError(txError)) {
          const errorMsg = handleWalletError(txError);
          if (errorMsg) {
            setErrorMessage(errorMsg);
          }
        }
      }
    } catch (pinataError) {
      // Error will be shown in UI
      setErrorMessage(t("errors.network_error"));
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormState({
      ...formState,
      [e.target.name]: e.target.value,
    });
  };

  const handleFileChange = (value: File | File[] | undefined) => {
    if (value && !Array.isArray(value)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageBuffer(e.target?.result as ArrayBuffer);
        const blob = new Blob([e.target?.result as ArrayBuffer], {
          type: value.type,
        });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      };
      reader.readAsArrayBuffer(value);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 space-y-1 lg:grid-cols-2 lg:space-x-2 p-5 bg-card">
        <div className="flex flex-col space-y-2">
          <h2 className="bg-primary text-primary-foreground px-2 w-full">
            {t("create.settings")}
          </h2>
          {/* Name Input */}
          <div className="space-y-2">
            <Label htmlFor="name">{t("create.name")}</Label>
            <Input
              id="name"
              type="text"
              name="name"
              value={formState.name}
              onChange={handleChange}
              required
            />
          </div>

          {/* Symbol Input */}
          <div className="space-y-2">
            <Label htmlFor="symbol">{t("create.symbol")}</Label>
            <Input
              id="symbol"
              type="text"
              name="symbol"
              value={formState.symbol}
              onChange={handleChange}
              required
            />
          </div>

          {/* Description Textarea Input */}
          <div className="space-y-2">
            <Label htmlFor="description">{t("create.description")}</Label>
            <Textarea
              id="description"
              name="description"
              value={formState.description}
              onChange={handleChange}
              required
            />
          </div>

          <div className="flex flex-row items-start gap-4">
            {/* Creator Supply Input */}
            <div className="space-y-2">
              <Label htmlFor="creatorSupply">
                {t("create.creator_supply")}
              </Label>
              <Input
                id="creatorSupply"
                type="text"
                name="creatorSupply"
                placeholder="0"
                value={formState.creatorSupply}
                onChange={(e) => {
                  // Check if value exceeds total supply
                  const value = e.target.value;
                  const numValue = Number(value) || 0;

                  // If it exceeds total supply, cap it
                  if (numValue > TOTAL_SUPPLY) {
                    setFormState({
                      ...formState,
                      creatorSupply: TOTAL_SUPPLY.toString(),
                    });
                  } else {
                    setFormState({
                      ...formState,
                      creatorSupply: value,
                    });
                  }
                }}
                max={TOTAL_SUPPLY}
                className="h-9" // <- this matches the button height
              />
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {t("pool.liquidity")}: {poolSupply.toLocaleString()} (
                  {t("coin.total_supply")}: {TOTAL_SUPPLY.toLocaleString()})
                </p>
                {Number(formState.creatorSupply) >= TOTAL_SUPPLY && (
                  <p className="text-xs text-chart-5">
                    {t("common.max")}: {TOTAL_SUPPLY.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            {/* Swap Fee Input */}
            <div className="mt-[17px]">
              {" "}
              {/* aligns button with input below label */}
              <Popover open={showFeeSelector} onOpenChange={setShowFeeSelector}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-9 text-sm px-2 py-1 rounded-md w-[180px] border border-input hover:bg-secondary-foreground transition-colors flex items-center gap-1"
                  >
                    <span className="w-[100px]">{t("create.swap_fee")}: </span>
                    <span className="font-semibold text-primary">
                      {feeToPercentage(swapFee)}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">
                      {t("create.swap_fee")}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {t("create.max_swap_fee")}
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {[25, 50, 100, 150, 200, 300].map((fee) => (
                        <button
                          key={fee}
                          type="button"
                          className={`text-xs px-3 py-2 rounded border transition-colors ${
                            swapFee === fee
                              ? "bg-primary border-primary text-primary"
                              : "border-input hover:bg-secondary-foreground"
                          }`}
                          onClick={() => {
                            setSwapFee(fee);
                            setCustomFeeInput("");
                            setShowFeeSelector(false);
                          }}
                        >
                          {feeToPercentage(fee)}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        {t("create.swap_fee")} (%)
                      </label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="e.g. 0.75"
                          className="text-xs h-8"
                          value={customFeeInput}
                          onChange={(e) => {
                            // Only allow numbers and up to one decimal point
                            const value = e.target.value;

                            // Validate format (numbers with up to 2 decimal places and max 2 digits before decimal)
                            if (
                              value === "" ||
                              /^[0-9]{1,2}(\.?[0-9]{0,2})?$/.test(value)
                            ) {
                              // Check if the value exceeds the maximum allowed (99.99)
                              const numValue = parseFloat(value);
                              if (
                                value === "" ||
                                isNaN(numValue) ||
                                numValue <= 99.99
                              ) {
                                setCustomFeeInput(value);
                              }
                            }
                          }}
                          onBlur={() => {
                            // Format on blur to ensure proper format
                            setCustomFeeInput(
                              formatPercentageInput(customFeeInput),
                            );
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => {
                            const customFeePercent = parseFloat(customFeeInput);
                            if (
                              !isNaN(customFeePercent) &&
                              customFeePercent >= 0.01 &&
                              customFeePercent <= 99.99
                            ) {
                              // Convert percentage to basis points for internal use
                              const basisPoints =
                                percentageToBasisPoints(customFeePercent);
                              setSwapFee(basisPoints);
                              setShowFeeSelector(false);
                            }
                          }}
                          disabled={
                            !customFeeInput ||
                            isNaN(parseFloat(customFeeInput)) ||
                            parseFloat(customFeeInput) < 0.01 ||
                            parseFloat(customFeeInput) > 99.99 ||
                            !/^[0-9]{1,2}(\.?[0-9]{0,2})?$/.test(customFeeInput)
                          }
                        >
                          {t("common.confirm")}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {customFeeInput &&
                        !isNaN(parseFloat(customFeeInput)) &&
                        /^[0-9]{1,2}(\.?[0-9]{0,2})?$/.test(customFeeInput)
                          ? `${customFeeInput}% = ${percentageToBasisPoints(parseFloat(customFeeInput))} basis points`
                          : t("errors.invalid_amount")}
                      </p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Token Logo Image Input */}
          <div className="space-y-2">
            <Label htmlFor="logo">{t("create.image")}</Label>
            <ImageInput onChange={handleFileChange} />
          </div>

          <div className="space-y-2 border p-4 rounded-md bg-card/80">
            <Label htmlFor="ethAmount" className="text-md font-semibold">
              {t("pool.liquidity")} (ETH {t("common.amount")})
            </Label>
            <div className="flex gap-2 items-center">
              <Input
                id="ethAmount"
                type="text"
                name="ethAmount"
                placeholder="0.01"
                value={formState.ethAmount}
                onChange={handleChange}
                className="flex-grow"
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setFormState({ ...formState, ethAmount: "0.01" })
                }
                className={`transition-all ${formState.ethAmount === "0.01" ? "bg-primary/10 border-primary/30" : ""}`}
              >
                0.01 ETH
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setFormState({ ...formState, ethAmount: "0.033" })
                }
                className={`transition-all ${formState.ethAmount === "0.033" ? "bg-primary/10 border-primary/30" : ""}`}
              >
                0.033 ETH
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFormState({ ...formState, ethAmount: "0.5" })}
                className={`transition-all ${formState.ethAmount === "0.5" ? "bg-primary/10 border-primary/30" : ""}`}
              >
                0.5 ETH
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFormState({ ...formState, ethAmount: "1" })}
                className={`transition-all ${formState.ethAmount === "1" ? "bg-primary/10 border-primary/30" : ""}`}
              >
                1 ETH
              </Button>
            </div>
          </div>
        </div>
        <div className="flex flex-col space-y-2">
          <h2 className="bg-secondary text-secondary-foreground px-2 w-full">
            {t("create.preview")}
          </h2>
          <div className="relative flex flex-row items-center">
            {previewUrl && (
              <img
                src={previewUrl}
                alt={`${formState.name} logo`}
                className={`inset-0 m-5 w-12 h-12 rounded-full object-cover transition-opacity duration-300 ${previewUrl ? "opacity-100" : "opacity-0"}`}
                style={{ zIndex: 1 }}
                loading="lazy"
              />
            )}
            <div>
              <CoinPreview
                name={formState.name}
                symbol={formState.symbol}
                coinId={computeCoinId(formState.name, formState.symbol).id}
                isLoading={!formState.name || !formState.symbol}
              />
              <span>
                (Address:{" "}
                {computeCoinId(formState.name, formState.symbol).address})
              </span>

              <p className="text-sm font-medium description-text mt-1 overflow-y-auto max-h-20 content-transition loaded">
                {formState.description ?? "Set description"}
              </p>
            </div>
          </div>
          {/* Market Cap Estimation */}
          {marketCapEstimation && (
            <div className="mt-3 p-3 bg-secondary/30 rounded-md border border-secondary/50">
              <h4 className="text-sm font-medium text-foreground mb-2">
                Launch Projections
              </h4>
              <div className="flex flex-col gap-2">
                <div className="bg-card p-2 rounded border border-border">
                  <h5 className="text-xs font-medium text-muted-foreground">
                    {t("coin.price").toUpperCase()}
                  </h5>
                  <div className="flex items-center text-sm mt-1">
                    <span className="font-medium text-chart-2">
                      ${marketCapEstimation.tokenPriceUsd.toFixed(8)}
                    </span>
                  </div>
                </div>

                <div className="bg-card p-2 rounded border border-border">
                  <h5 className="text-xs font-medium text-muted-foreground">
                    {t("coin.market_cap").toUpperCase()}
                  </h5>
                  <div className="flex flex-col">
                    <div className="flex items-center text-sm">
                      <span className="text-muted-foreground min-w-20">
                        ETH:
                      </span>
                      <span className="font-medium">
                        {formatNumber(marketCapEstimation.eth, 2)} ETH
                      </span>
                    </div>
                    <div className="flex items-center text-sm mt-1">
                      <span className="text-muted-foreground min-w-20">
                        USD:
                      </span>
                      <span className="font-medium">
                        ${formatNumber(marketCapEstimation.usd, 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center mt-2">
                <p className="text-xs text-muted-foreground">
                  {t("pool.liquidity")}: {formState.ethAmount} ETH{" "}
                  {t("common.with")} {poolSupply.toLocaleString()}{" "}
                  {t("coin.circulating_supply").toLowerCase()}
                </p>
              </div>
            </div>
          )}
          <Button disabled={isPending} type="submit">
            {isPending ? t("common.loading") : t("create.title")}
          </Button>
          {errorMessage && (
            <div className="text-sm text-destructive mt-2">{errorMessage}</div>
          )}
          {isSuccess && (
            <div className="text-sm text-chart-2 mt-2">
              {t("create.success")} {JSON.stringify(data)}
            </div>
          )}
          <p>
            {t("coinpaper.view")}{" "}
            <Link to="/coinpaper" className="[&.active]:font-bold">
              {t("common.coinpaper")}
            </Link>
          </p>
        </div>
      </div>
    </form>
  );
}
