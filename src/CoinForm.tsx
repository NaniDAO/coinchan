import confetti from "canvas-confetti";
import {
  useState,
  useEffect,
  useRef,
  ChangeEvent,
  DragEvent,
  useMemo,
} from "react";
import { CoinchanAbi, CoinchanAddress } from "./constants/Coinchan";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { parseEther } from "viem";
import { pinImageToPinata, pinJsonToPinata } from "./utils/pinata";
import { handleWalletError, isUserRejectionError } from "./utils";
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

// CheckTheChain contract ABI for fetching ETH price
const CheckTheChainAbi = [
  {
    inputs: [{ internalType: "string", name: "symbol", type: "string" }],
    name: "checkPrice",
    outputs: [
      { internalType: "uint256", name: "price", type: "uint256" },
      { internalType: "string", name: "priceStr", type: "string" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// CheckTheChain contract address
const CheckTheChainAddress = "0x0000000000cDC1F8d393415455E382c30FBc0a84";

// Define proper types for the ImageInput component
interface ImageInputProps {
  onChange: (file: File | File[] | undefined) => void;
}

// Fixed ImageInput component with drag and drop and preview
const ImageInput = ({ onChange }: ImageInputProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
      // Reset the input value to ensure onChange fires even if the same file is selected again
      e.target.value = "";
    }
  };

  const handleFile = (file: File) => {
    setSelectedFileName(file.name);

    // Create preview URL
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Call parent onChange handler
    onChange(file);

    // Clean up the preview URL when component unmounts
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files?.length) {
      handleFile(files[0]);
    }
  };

  // Clean up the URL when component unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      <div
        className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-md ${
          isDragging ? "border-primary bg-primary/10" : "border-input"
        } transition-colors duration-200`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {previewUrl ? (
          <div className="flex flex-col items-center gap-4">
            <img
              src={previewUrl}
              alt="Preview"
              className="max-h-32 max-w-full object-contain rounded-md"
            />
            <div className="flex flex-col items-center">
              <p className="text-sm text-muted-foreground mb-2">{selectedFileName}</p>
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                size="sm"
              >
                Change Image
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="mb-2">Drag & drop image here</p>
            <p>or</p>
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="mt-2"
            >
              Browse Files
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export function CoinForm() {
  const [formState, setFormState] = useState({
    name: "",
    symbol: "",
    description: "",
    logo: "",
    creatorSupply: "0",
    ethAmount: "0.01", // Default ETH amount
  });

  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);
  const { address } = useAccount();

  const TOTAL_SUPPLY = 21000000;
  const [poolSupply, setPoolSupply] = useState(TOTAL_SUPPLY);
  const [swapFee, setSwapFee] = useState(100); // Default 1% fee (represented as basis points)
  const [customFeeInput, setCustomFeeInput] = useState("");
  const [showFeeSelector, setShowFeeSelector] = useState(false);
  const vestingDuration = 15778476;
  const vesting = true;

  // Fetch ETH price in USD from CheckTheChain
  const { data: ethPriceData } = useReadContract({
    address: CheckTheChainAddress,
    abi: CheckTheChainAbi,
    functionName: "checkPrice",
    args: ["WETH"],
    chainId: mainnet.id,
    query: {
      // Refresh every 60 seconds
      staleTime: 60_000,
    },
  });

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
        !address ? "Wallet not connected" : "Please upload an image",
      );
      return;
    }

    // Validate ETH amount
    const ethAmount = Number(formState.ethAmount);
    if (isNaN(ethAmount) || ethAmount <= 0) {
      setErrorMessage("Please enter a valid ETH amount greater than 0");
      return;
    }

    // Validate creator supply
    const creatorSupplyValue = Number(formState.creatorSupply) || 0;
    if (creatorSupplyValue > TOTAL_SUPPLY) {
      setErrorMessage(
        `Creator supply cannot exceed ${TOTAL_SUPPLY.toLocaleString()} tokens`,
      );
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
      setErrorMessage("Failed to upload image to IPFS. Please try again.");
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
      };
      reader.readAsArrayBuffer(value);
    }
  };

  return (
    <div className="border-2 border-primary rounded-lg p-5 bg-card">
      <div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              name="name"
              value={formState.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="symbol">Symbol</Label>
            <Input
              id="symbol"
              type="text"
              name="symbol"
              value={formState.symbol}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              value={formState.description}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="creatorSupply">Creator Supply</Label>
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
            />
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Pool Supply: {poolSupply.toLocaleString()} (Total:{" "}
                {TOTAL_SUPPLY.toLocaleString()})
              </p>
              {Number(formState.creatorSupply) >= TOTAL_SUPPLY && (
                <p className="text-xs text-chart-5">
                  Max: {TOTAL_SUPPLY.toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo">Logo</Label>
            <ImageInput onChange={handleFileChange} />
          </div>

          <div className="space-y-2 border p-4 rounded-md bg-card/80">
            <Label htmlFor="ethAmount" className="text-md font-semibold">
              Initial Liquidity (ETH Amount)
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

            {/* Market Cap Estimation */}
            {marketCapEstimation && (
              <div className="mt-3 p-3 bg-secondary/30 rounded-md border border-secondary/50">
                <h4 className="text-sm font-medium text-foreground mb-2">
                  Launch Projections
                </h4>
                <div className="flex flex-col gap-2">
                  <div className="bg-card p-2 rounded border border-border">
                    <h5 className="text-xs font-medium text-muted-foreground">
                      TOKEN PRICE
                    </h5>
                    <div className="flex items-center text-sm mt-1">
                      <span className="font-medium text-chart-2">
                        ${marketCapEstimation.tokenPriceUsd.toFixed(8)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-card p-2 rounded border border-border">
                    <h5 className="text-xs font-medium text-muted-foreground">
                      MARKET CAP
                    </h5>
                    <div className="flex flex-col">
                      <div className="flex items-center text-sm">
                        <span className="text-muted-foreground min-w-20">ETH:</span>
                        <span className="font-medium">
                          {formatNumber(marketCapEstimation.eth, 2)} ETH
                        </span>
                      </div>
                      <div className="flex items-center text-sm mt-1">
                        <span className="text-muted-foreground min-w-20">USD:</span>
                        <span className="font-medium">
                          ${formatNumber(marketCapEstimation.usd, 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center mt-2">
                  <p className="text-xs text-muted-foreground">
                    Based on {formState.ethAmount} ETH liquidity with{" "}
                    {poolSupply.toLocaleString()} coins
                  </p>
                  <div className="ml-auto">
                    <Popover
                      open={showFeeSelector}
                      onOpenChange={setShowFeeSelector}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded border border-input hover:bg-secondary-foreground transition-colors flex items-center gap-1"
                        >
                          Fee:{" "}
                          <span className="font-semibold text-primary">
                            {feeToPercentage(swapFee)}
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3">
                        <div className="space-y-2">
                          <h4 className="font-medium text-sm">
                            Customize Swap Fee
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            Select a fee percentage for swaps
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
                              Custom Fee (%)
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
                                  const customFeePercent =
                                    parseFloat(customFeeInput);
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
                                  !/^[0-9]{1,2}(\.?[0-9]{0,2})?$/.test(
                                    customFeeInput,
                                  )
                                }
                              >
                                Set
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {customFeeInput &&
                              !isNaN(parseFloat(customFeeInput)) &&
                              /^[0-9]{1,2}(\.?[0-9]{0,2})?$/.test(
                                customFeeInput,
                              )
                                ? `${customFeeInput}% = ${percentageToBasisPoints(parseFloat(customFeeInput))} basis points`
                                : "Enter a value between 0.01% and 99.99% (max 2 decimal places)"}
                            </p>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            )}
          </div>

          <p>
            Read the{" "}
            <Link to="/coinpaper" className="[&.active]:font-bold">
              coinpaper
            </Link>{" "}
            to learn more.
          </p>

          <Button disabled={isPending} type="submit">
            {isPending ? "Check Wallet" : "Coin It!"}
          </Button>

          {errorMessage && (
            <div className="text-sm text-destructive mt-2">{errorMessage}</div>
          )}

          {isSuccess && (
            <div className="text-sm text-chart-2 mt-2">
              Success! Transaction: {JSON.stringify(data)}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
