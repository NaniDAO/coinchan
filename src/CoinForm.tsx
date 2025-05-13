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
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import ImageInput from "@/components/ui/image-input";

interface FormState {
  name: string;
  symbol: string;
  description: string;
  ethAmount: string;
  website: string;
  discord: string;
  twitter: string;
}

const initialFormState: FormState = {
  name: "",
  symbol: "",
  description: "",
  ethAmount: "0.01",
  website: "",
  discord: "",
  twitter: "",
};

export const CoinForm = () => {
  const MAX_NAME_LENGTH = 32;
  const MAX_SYMBOL_LENGTH = 16;
  const MAX_DESCRIPTION_LENGTH = 400;

  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Coin Creation process - tokenURI data
  const [tokenURI, setTokenURI] = useState<string | null>(null);
  const [tokenUriHash, setTokenUriHash] = useState("");
  const [pendingPin, setPendingPin] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);
  const { address } = useAccount();

  const TOTAL_SUPPLY = 21000000;
  const [poolSupply, setPoolSupply] = useState(TOTAL_SUPPLY);
  const [swapFee, setSwapFee] = useState(100); // Default 1% fee (represented as basis points)
  const [customFeeInput, setCustomFeeInput] = useState("");
  const [showFeeSelector, setShowFeeSelector] = useState(false);
  const vestingDuration = 15778476;
  const vesting = true;

  // Function to handle form input changes
  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    if (name === "ethAmount") {
      // Validate ETH input as a number
      const numericValue = parseFloat(value);
      if (
        value === "" ||
        (!isNaN(numericValue) && numericValue >= 0 && numericValue <= 5)
      ) {
        setFormState((prev) => ({ ...prev, [name]: value }));
      }
      return;
    }

    if (name === "name" && value.length > MAX_NAME_LENGTH) {
      return;
    }

    if (name === "symbol" && value.length > MAX_SYMBOL_LENGTH) {
      return;
    }

    if (name === "description" && value.length > MAX_DESCRIPTION_LENGTH) {
      return;
    }

    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  // Determine the creator supply based on ETH amount
  const creatorSupplyPercentage = 0.5; // 50% to creator
  let creatorSupply = Math.round(TOTAL_SUPPLY * creatorSupplyPercentage);
  const finalPoolSupply = TOTAL_SUPPLY - creatorSupply;
  const safeCreatorSupply = creatorSupply;

  // Helper function to read file as base64 (for preview)
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle file selection
  const handleFileChange = async (selectedFile: File) => {
    setImageFile(selectedFile);
    try {
      // Also prepare the ArrayBuffer for IPFS upload
      const buffer = await selectedFile.arrayBuffer();
      setImageBuffer(buffer);
    } catch (error) {
      console.error("Error reading file:", error);
    }
  };

  // Create a reference for the contract write request to avoid stale closures
  const contractWriteParamsRef = useRef<{
    functionName: string;
    args: any[];
  } | null>(null);

  // Contract interaction hooks
  const {
    writeContract,
    isPending: isContractWritePending,
    data: contractTxHash,
  } = useWriteContract();

  // Function to format fee as percentage string
  const feeToPercentage = (basisPoints: number) => {
    return `${(basisPoints / 100).toFixed(2)}%`;
  };

  // Estimates the market cap as a function of ETH amount and token supply
  const marketCapEstimation = useMemo(() => {
    try {
      // Parse ETH amount as a number (defaulting to 0 if invalid)
      const ethAmountFloat = parseFloat(formState.ethAmount) || 0;

      // Assume 1 ETH = $3000 USD (simplified estimate)
      const ethPriceUsd = 3000;

      // Calculate ETH value of the pool
      const ethValueUsd = ethAmountFloat * ethPriceUsd;

      // Calculate token value based on pool percentage
      const poolPercentage = finalPoolSupply / TOTAL_SUPPLY;
      const fullMarketCapUsd = ethValueUsd / poolPercentage;

      // Calculate token price
      const tokenPriceEth = ethAmountFloat / finalPoolSupply;
      const tokenPriceUsd = tokenPriceEth * ethPriceUsd;

      return {
        ethValue: ethAmountFloat,
        ethValueUsd,
        marketCapEth: ethAmountFloat / poolPercentage,
        usd: fullMarketCapUsd,
        tokenPriceEth,
        tokenPriceUsd,
      };
    } catch (error) {
      // Return default values on error
      return {
        ethValue: 0,
        ethValueUsd: 0,
        marketCapEth: 0,
        usd: 0,
        tokenPriceEth: 0,
        tokenPriceUsd: 0,
      };
    }
  }, [formState.ethAmount, finalPoolSupply, TOTAL_SUPPLY]);

  const handleFormReset = () => {
    // Reset form state
    setFormState(initialFormState);
    setImageFile(null);
    setImageBuffer(null);
    setTokenURI(null);
    setTokenUriHash("");
    setPendingPin(false);
    setLoading(false);
    setError(null);
    setTxHash(null);
    setSuccess(false);
  };

  const handleCreateClick = async () => {
    if (!address) {
      setError("Please connect your wallet");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Validate required form fields
      if (
        !formState.name ||
        !formState.symbol ||
        !formState.description ||
        !formState.ethAmount ||
        !imageBuffer
      ) {
        throw new Error("Please fill in all required fields and add an image");
      }

      // Validate ETH amount
      const ethAmount = parseFloat(formState.ethAmount);
      if (isNaN(ethAmount) || ethAmount <= 0) {
        throw new Error("Please enter a valid ETH amount greater than 0");
      }

      // Upload image to IPFS first
      setPendingPin(true);
      const { fileUri, fileCID } = await pinImageToPinata(
        imageBuffer,
        imageFile!.name
      );

      console.log("Image pinned with CID:", fileCID);
      console.log("Image URI:", fileUri);

      // Prepare and pin the metadata
      const metadata = {
        name: formState.name,
        symbol: formState.symbol,
        description: formState.description,
        image: fileUri, // The IPFS image URI
        attributes: [
          {
            trait_type: "Coin Name",
            value: formState.name,
          },
          {
            trait_type: "Symbol",
            value: formState.symbol,
          },
          // Add socials if present
          ...(formState.website
            ? [
                {
                  trait_type: "Website",
                  value: formState.website,
                },
              ]
            : []),
          ...(formState.twitter
            ? [
                {
                  trait_type: "Twitter",
                  value: formState.twitter,
                },
              ]
            : []),
          ...(formState.discord
            ? [
                {
                  trait_type: "Discord",
                  value: formState.discord,
                },
              ]
            : []),
        ],
      };

      // Pin metadata to IPFS
      const { fileUri: metadataUri, fileCID: metadataCID } =
        await pinJsonToPinata(metadata, `${formState.symbol.toLowerCase()}-metadata.json`);

      console.log("Metadata pinned with CID:", metadataCID);
      console.log("Metadata URI:", metadataUri);

      // Set the token URI and hash for contract interaction
      setTokenURI(metadataUri);
      setTokenUriHash(metadataCID);
      setPendingPin(false);

      // Prepare contract interaction data
      contractWriteParamsRef.current = {
        functionName: "deployToken",
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
      };

      // Execute the contract interaction
      writeContract({
        address: CoinchanAddress,
        abi: CoinchanAbi,
        functionName: contractWriteParamsRef.current.functionName,
        args: contractWriteParamsRef.current.args,
        value: parseEther(formState.ethAmount),
      });
    } catch (error) {
      console.error("Creation error:", error);

      // Handle user rejection vs other errors
      if (isUserRejectionError(error)) {
        setError("Transaction rejected by user");
      } else {
        const errorMessage = handleWalletError(error);
        setError(errorMessage || "Failed to create token. Please try again.");
      }
      setLoading(false);
    }
  };

  // Effect to handle transaction result
  useEffect(() => {
    if (contractTxHash) {
      setTxHash(contractTxHash);
      setSuccess(true);
      setLoading(false);

      // Trigger confetti animation on success
      confetti({
        particleCount: 200,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [contractTxHash]);

  return (
    <div className="w-full max-w-3xl mx-auto mt-6 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
      <h2 className="text-3xl font-bold mb-6 text-center text-deep-red">
        Create Coin
      </h2>

      {success && txHash ? (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 p-4 rounded-md text-center mb-6">
          <h3 className="text-lg font-bold text-green-700 dark:text-green-400 mb-2">
            Success! Your coin has been created.
          </h3>
          <p className="text-green-600 dark:text-green-300 mb-4">
            Transaction Hash:{" "}
            <a
              href={`https://etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-green-800 dark:hover:text-green-200"
            >
              {txHash}
            </a>
          </p>
          <Button onClick={handleFormReset} className="mt-2">
            Create Another Coin
          </Button>
        </div>
      ) : (
        <form className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-md font-semibold">
              Coin Name
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g., Meme Coin"
              value={formState.name}
              onChange={handleInputChange}
              maxLength={MAX_NAME_LENGTH}
              className="focus:border-blue-500"
            />
            <div className="text-xs text-gray-500 dark:text-gray-400 flex justify-end">
              {formState.name.length}/{MAX_NAME_LENGTH}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="symbol" className="text-md font-semibold">
              Symbol
            </Label>
            <Input
              id="symbol"
              name="symbol"
              placeholder="e.g., MEME"
              value={formState.symbol}
              onChange={handleInputChange}
              maxLength={MAX_SYMBOL_LENGTH}
              className="focus:border-blue-500 uppercase"
            />
            <div className="text-xs text-gray-500 dark:text-gray-400 flex justify-end">
              {formState.symbol.length}/{MAX_SYMBOL_LENGTH}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-md font-semibold">
              Description
            </Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Describe your token..."
              value={formState.description}
              onChange={handleInputChange}
              maxLength={MAX_DESCRIPTION_LENGTH}
              className="min-h-24 focus:border-blue-500"
            />
            <div className="text-xs text-gray-500 dark:text-gray-400 flex justify-end">
              {formState.description.length}/{MAX_DESCRIPTION_LENGTH}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo">Logo</Label>
            <ImageInput onChange={handleFileChange} />
          </div>

          <div className="space-y-2 border p-4 rounded-md bg-gray-50 dark:bg-gray-900/30">
            <div className="flex justify-between items-center">
              <Label htmlFor="ethAmount" className="text-md font-semibold">
                Initial Liquidity (ETH Amount)
              </Label>
              <Popover
                open={showFeeSelector}
                onOpenChange={setShowFeeSelector}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="text-xs flex items-center gap-1 hover:underline cursor-pointer bg-transparent border-none p-0 text-gray-700 dark:text-gray-300"
                  >
                    Fee:{" "}
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {feeToPercentage(swapFee)}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 bg-white dark:bg-gray-800">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-gray-800 dark:text-gray-200">
                      Customize Swap Fee
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      Select a fee percentage for swaps
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {[25, 50, 100, 150, 200, 300].map((fee) => (
                        <button
                          key={fee}
                          type="button"
                          className={`text-xs px-3 py-2 rounded border transition-colors ${
                            swapFee === fee
                              ? "bg-blue-100 dark:bg-blue-900 border-blue-400 dark:border-blue-500 text-blue-700 dark:text-blue-300 font-medium"
                              : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
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
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
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
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            if (customFeeInput) {
                              const numericFee = parseFloat(customFeeInput);
                              if (!isNaN(numericFee) && numericFee > 0) {
                                // Convert percentage to basis points (e.g., 1.5% → 150)
                                const feeBasisPoints = Math.round(numericFee * 100);
                                setSwapFee(feeBasisPoints);
                                setShowFeeSelector(false);
                              }
                            }
                          }}
                        >
                          Set
                        </Button>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex gap-2 items-center">
              <Input
                id="ethAmount"
                type="text"
                name="ethAmount"
                inputMode="decimal"
                placeholder="0.01"
                value={formState.ethAmount}
                onChange={handleInputChange}
                className="focus:border-blue-500"
              />
              <div className="text-md font-medium">ETH</div>
            </div>
            <div className="text-xs text-gray-500">Minimum: 0.01 ETH</div>

            <div className="mt-4 border-t pt-3">
              <h3 className="text-md font-semibold mb-2">Market Cap Estimate</h3>
              <div className="bg-white dark:bg-gray-800 rounded-md p-3 border shadow-sm">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      TOKEN PRICE
                    </h5>
                    <div className="flex items-center text-sm mt-1">
                      <span className="font-medium text-green-600 dark:text-green-400">
                        ${marketCapEstimation.tokenPriceUsd.toFixed(8)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      MARKET CAP
                    </h5>
                    <div className="flex flex-col">
                      <div className="flex items-center text-sm">
                        <span className="text-gray-600 dark:text-gray-400 min-w-20">ETH:</span>
                        <span className="font-medium">
                          {formatNumber(marketCapEstimation.marketCapEth, 2)} ETH
                        </span>
                      </div>
                      <div className="flex items-center text-sm">
                        <span className="text-gray-600 dark:text-gray-400 min-w-20">USD:</span>
                        <span className="font-medium">
                          ${formatNumber(marketCapEstimation.usd, 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center mt-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Based on {formState.ethAmount} ETH liquidity with{" "}
                    {poolSupply.toLocaleString()} coins
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-md font-semibold">Social Media (optional)</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="website" className="text-sm">
                  Website
                </Label>
                <Input
                  id="website"
                  name="website"
                  placeholder="https://..."
                  value={formState.website}
                  onChange={handleInputChange}
                  className="focus:border-blue-500"
                />
              </div>
              <div>
                <Label htmlFor="twitter" className="text-sm">
                  X/Twitter
                </Label>
                <Input
                  id="twitter"
                  name="twitter"
                  placeholder="@username"
                  value={formState.twitter}
                  onChange={handleInputChange}
                  className="focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="discord" className="text-sm">
                Discord
              </Label>
              <Input
                id="discord"
                name="discord"
                placeholder="https://discord.gg/..."
                value={formState.discord}
                onChange={handleInputChange}
                className="focus:border-blue-500"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-md border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          <Button
            type="button"
            onClick={handleCreateClick}
            disabled={loading || isContractWritePending || pendingPin}
            className="w-full py-2"
          >
            {(loading || isContractWritePending) && (
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
            )}
            {pendingPin
              ? "Uploading to IPFS..."
              : loading || isContractWritePending
              ? "Creating Coin..."
              : "Create Coin"}
          </Button>

          <div className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">
            * Creating a coin requires ETH for gas + initial liquidity
          </div>
        </form>
      )}
    </div>
  );
};

