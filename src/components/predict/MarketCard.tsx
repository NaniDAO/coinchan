import React, { useState, useEffect, useMemo } from "react";
import { formatEther } from "viem";
import {
  useEnsName,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useBlockNumber,
} from "wagmi";
import { mainnet } from "wagmi/chains";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TradeModal } from "./TradeModal";
import { MarketCountdown } from "./MarketCountdown";
import { ResolverControls } from "./ResolverControls";
import { PredictionMarketAddress, PredictionMarketAbi } from "@/constants/PredictionMarket";
import { PredictionAMMAbi } from "@/constants/PredictionMarketAMM";
import { ExternalLink, BadgeCheck, Copy, Check, Sparkles, Coins, Share2, Star } from "lucide-react";
import { formatImageURL } from "@/hooks/metadata";
import {
  isTrustedResolver,
  isPerpetualOracleResolver,
  getTrustedResolver,
  ETH_WENT_UP_RESOLVER_ADDRESS,
  ETH_WENT_UP_RESOLVER_V2_ADDRESS,
  COINFLIP_RESOLVER_ADDRESS,
  NOUNS_PASS_VOTING_RESOLVER_ADDRESS,
  BETH_PM_RESOLVER_ADDRESS,
  UNISUPPLY_PM_RESOLVER_ADDRESS,
  BUNNIBOUNTYPM_RESOLVER_ADDRESS,
  UNIV4_FEE_SWITCH_PM_RESOLVER_ADDRESS,
} from "@/constants/TrustedResolvers";
import { extractOracleMetadata, extractNounsEvalBlock } from "@/lib/perpetualOracleUtils";
import { EthWentUpResolverAbi } from "@/constants/EthWentUpResolver";
import { CoinflipResolverAbi } from "@/constants/CoinflipResolver";
import { NounsPassVotingResolverAbi } from "@/constants/NounsPassVotingResolver";
import { BETHPMResolverAbi } from "@/constants/BETHPMResolver";
import { UNISUPPLYPMResolverAbi } from "@/constants/UNISUPPLYPMResolver";
import { BUNNIBOUNTYPMResolverAbi } from "@/constants/BUNNIBOUNTYPMResolver";
import { UniV4FeeSwitchPMResolverAbi } from "@/constants/UniV4FeeSwitchPMResolver";
import { ChainlinkAggregatorV3Abi, CHAINLINK_ETH_USD_FEED } from "@/constants/ChainlinkAggregator";
import { useBalance } from "wagmi";
import ReactMarkdown from "react-markdown";
import { isUserRejectionError } from "@/lib/errors";
import { Link } from "@tanstack/react-router";

interface MarketMetadata {
  name: string;
  symbol: string;
  description?: string;
  image: string;
}

interface MarketCardProps {
  marketId: bigint;
  yesSupply: bigint;
  noSupply: bigint;
  resolver: string;
  resolved: boolean;
  outcome: boolean;
  pot: bigint;
  payoutPerShare: bigint;
  description: string;
  closingTime?: number;
  userYesBalance?: bigint;
  userNoBalance?: bigint;
  userClaimable?: bigint;
  marketType?: "parimutuel" | "amm";
  contractAddress?: `0x${string}`;
  rYes?: bigint;
  rNo?: bigint;
  onClaimSuccess?: () => void;
}

export const MarketCard: React.FC<MarketCardProps> = ({
  marketId,
  yesSupply,
  noSupply,
  resolver,
  resolved,
  outcome,
  pot,
  payoutPerShare,
  description,
  userYesBalance = 0n,
  userNoBalance = 0n,
  userClaimable = 0n,
  marketType = "parimutuel",
  contractAddress = PredictionMarketAddress,
  rYes,
  rNo,
  onClaimSuccess,
}) => {
  const [metadata, setMetadata] = useState<MarketMetadata | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [initialPosition, setInitialPosition] = useState<"yes" | "no">("yes");

  // Favorites management
  const [isFavorite, setIsFavorite] = useState(() => {
    const favorites = JSON.parse(localStorage.getItem("favoriteMarkets") || "[]");
    return favorites.includes(marketId.toString());
  });

  const toggleFavorite = () => {
    const favorites = JSON.parse(localStorage.getItem("favoriteMarkets") || "[]");
    const marketIdStr = marketId.toString();
    const newFavorites = isFavorite
      ? favorites.filter((id: string) => id !== marketIdStr)
      : [...favorites, marketIdStr];
    localStorage.setItem("favoriteMarkets", JSON.stringify(newFavorites));
    setIsFavorite(!isFavorite);
    toast.success(isFavorite ? "Removed from favorites" : "Added to favorites");
    // Notify MarketGallery to update favorites count
    window.dispatchEvent(new CustomEvent("favoriteToggled"));
  };

  // Share functionality
  const handleShare = async () => {
    const url = `${window.location.origin}/predict/${marketType}/${marketId}`;
    const text = `Check out this prediction market: ${metadata?.name || "Prediction Market"}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: metadata?.name || "Market", text, url });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Share failed:", err);
        }
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard!");
    }
  };
  const { address } = useAccount();
  const { data: currentBlockNumber } = useBlockNumber({ watch: true });

  // Track which transactions we've already shown toasts for to prevent duplicates
  const toastedClaim = React.useRef<string | null>(null);
  const toastedResolve = React.useRef<string | null>(null);
  const toastedTip = React.useRef<string | null>(null);
  const toastedClaimError = React.useRef<any>(null);
  const toastedResolveError = React.useRef<any>(null);
  const toastedTipError = React.useRef<any>(null);

  const { writeContract, data: claimHash, error: claimError } = useWriteContract();
  const { isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({
    hash: claimHash,
  });

  const { data: ensName } = useEnsName({
    address: resolver as `0x${string}`,
    chainId: mainnet.id,
  });

  const isTrusted = isTrustedResolver(resolver);
  const isPerpetualOracle = isPerpetualOracleResolver(resolver);
  const trustedResolverInfo = getTrustedResolver(resolver);
  const isEthWentUpResolver = resolver.toLowerCase() === ETH_WENT_UP_RESOLVER_ADDRESS.toLowerCase();
  const isEthWentUpResolverV2 = resolver.toLowerCase() === ETH_WENT_UP_RESOLVER_V2_ADDRESS.toLowerCase();
  const isCoinflipResolver = resolver.toLowerCase() === COINFLIP_RESOLVER_ADDRESS.toLowerCase();
  const isNounsResolver = resolver.toLowerCase() === NOUNS_PASS_VOTING_RESOLVER_ADDRESS.toLowerCase();
  const isBETHPMResolver = resolver.toLowerCase() === BETH_PM_RESOLVER_ADDRESS.toLowerCase();
  const isUNISUPPLYPMResolver = resolver.toLowerCase() === UNISUPPLY_PM_RESOLVER_ADDRESS.toLowerCase();
  const isBUNNIBOUNTYPMResolver = resolver.toLowerCase() === BUNNIBOUNTYPM_RESOLVER_ADDRESS.toLowerCase();
  const isUniV4FeeSwitchPMResolver = resolver.toLowerCase() === UNIV4_FEE_SWITCH_PM_RESOLVER_ADDRESS.toLowerCase();

  // Check ETH balance in resolver for tip button
  const { data: resolverBalance } = useBalance({
    address: ETH_WENT_UP_RESOLVER_ADDRESS as `0x${string}`,
    query: {
      enabled: isEthWentUpResolver,
    },
  });

  // Check ETH balance in V2 resolver for tip button
  const { data: resolverV2Balance } = useBalance({
    address: ETH_WENT_UP_RESOLVER_V2_ADDRESS as `0x${string}`,
    query: {
      enabled: isEthWentUpResolverV2,
    },
  });

  // Fetch tip amount from resolver
  const { data: tipPerResolve } = useReadContract({
    address: ETH_WENT_UP_RESOLVER_ADDRESS as `0x${string}`,
    abi: EthWentUpResolverAbi,
    functionName: "tipPerResolve",
    query: {
      enabled: isEthWentUpResolver,
    },
  });

  // Fetch tip amount from V2 resolver
  const { data: tipPerResolveV2 } = useReadContract({
    address: ETH_WENT_UP_RESOLVER_V2_ADDRESS as `0x${string}`,
    abi: EthWentUpResolverAbi,
    functionName: "tipPerResolve",
    query: {
      enabled: isEthWentUpResolverV2,
    },
  });

  // Check if EthWentUp market can be resolved using canResolveNow()
  const { data: ethWentUpCanResolveData } = useReadContract({
    address: ETH_WENT_UP_RESOLVER_ADDRESS as `0x${string}`,
    abi: EthWentUpResolverAbi,
    functionName: "canResolveNow",
    query: {
      enabled: isEthWentUpResolver && !resolved,
    },
  });

  // Check if EthWentUp V2 market can be resolved using canResolveNow()
  const { data: ethWentUpV2CanResolveData } = useReadContract({
    address: ETH_WENT_UP_RESOLVER_V2_ADDRESS as `0x${string}`,
    abi: EthWentUpResolverAbi,
    functionName: "canResolveNow",
    query: {
      enabled: isEthWentUpResolverV2 && !resolved,
    },
  });

  const canResolve = Boolean(
    isEthWentUpResolver && !resolved && ethWentUpCanResolveData && ethWentUpCanResolveData[0] === true, // ready
  );

  const canResolveV2 = Boolean(
    isEthWentUpResolverV2 && !resolved && ethWentUpV2CanResolveData && ethWentUpV2CanResolveData[0] === true, // ready
  );

  // Fetch epoch data for EthWentUp to get start price
  const { data: ethWentUpEpochData } = useReadContract({
    address: ETH_WENT_UP_RESOLVER_ADDRESS as `0x${string}`,
    abi: EthWentUpResolverAbi,
    functionName: "epochs",
    args: [marketId],
    query: {
      enabled: isEthWentUpResolver,
    },
  });

  // Fetch epoch data for EthWentUp V2 to get start price
  const { data: ethWentUpV2EpochData } = useReadContract({
    address: ETH_WENT_UP_RESOLVER_V2_ADDRESS as `0x${string}`,
    abi: EthWentUpResolverAbi,
    functionName: "epochs",
    args: [marketId],
    query: {
      enabled: isEthWentUpResolverV2,
    },
  });

  // Fetch current ETH/USD price from Chainlink
  const { data: currentEthPriceData } = useReadContract({
    address: CHAINLINK_ETH_USD_FEED as `0x${string}`,
    abi: ChainlinkAggregatorV3Abi,
    functionName: "latestRoundData",
    query: {
      enabled: isEthWentUpResolver || isEthWentUpResolverV2,
    },
  });

  // Show tip button if balance is low (less than 2x tipPerResolve)
  const showTipButton = Boolean(
    isEthWentUpResolver && resolverBalance && tipPerResolve && resolverBalance.value < tipPerResolve * 2n,
  );

  // Show tip button for V2 if balance is low (less than 2x tipPerResolve)
  const showTipButtonV2 = Boolean(
    isEthWentUpResolverV2 && resolverV2Balance && tipPerResolveV2 && resolverV2Balance.value < tipPerResolveV2 * 2n,
  );

  // Check ETH balance in CoinflipResolver for tip button
  const { data: coinflipResolverBalance } = useBalance({
    address: COINFLIP_RESOLVER_ADDRESS as `0x${string}`,
    query: {
      enabled: isCoinflipResolver,
    },
  });

  // Fetch tip amount from CoinflipResolver
  const { data: coinflipTipPerResolve } = useReadContract({
    address: COINFLIP_RESOLVER_ADDRESS as `0x${string}`,
    abi: CoinflipResolverAbi,
    functionName: "tipPerResolve",
    query: {
      enabled: isCoinflipResolver,
    },
  });

  // Check if coinflip market can be resolved using canResolveNow()
  const { data: coinflipCanResolveData } = useReadContract({
    address: COINFLIP_RESOLVER_ADDRESS as `0x${string}`,
    abi: CoinflipResolverAbi,
    functionName: "canResolveNow",
    query: {
      enabled: isCoinflipResolver && !resolved,
    },
  });

  const canResolveCoinflip = Boolean(
    isCoinflipResolver && !resolved && coinflipCanResolveData && coinflipCanResolveData[0] === true, // ready
  );

  // Show tip button for Coinflip if balance is low
  const showCoinflipTipButton = Boolean(
    isCoinflipResolver &&
      coinflipResolverBalance &&
      coinflipTipPerResolve &&
      coinflipResolverBalance.value < coinflipTipPerResolve * 2n,
  );

  // Extract Nouns proposal ID from metadata for contract calls
  const nounsProposalId =
    isNounsResolver && metadata && (metadata as any).nounsProposalId
      ? BigInt((metadata as any).nounsProposalId)
      : undefined;

  // Check ETH balance in NounsPassVotingResolver for tip button
  const { data: nounsResolverBalance } = useBalance({
    address: NOUNS_PASS_VOTING_RESOLVER_ADDRESS as `0x${string}`,
    query: {
      enabled: isNounsResolver,
    },
  });

  // Fetch tip amount from NounsPassVotingResolver
  const { data: nounsTipPerAction } = useReadContract({
    address: NOUNS_PASS_VOTING_RESOLVER_ADDRESS as `0x${string}`,
    abi: NounsPassVotingResolverAbi,
    functionName: "tipPerAction",
    query: {
      enabled: isNounsResolver,
    },
  });

  // Check if Nouns market can be resolved using canResolveNow(proposalId)
  const { data: nounsCanResolveData } = useReadContract({
    address: NOUNS_PASS_VOTING_RESOLVER_ADDRESS as `0x${string}`,
    abi: NounsPassVotingResolverAbi,
    functionName: "canResolveNow",
    args: nounsProposalId !== undefined ? [nounsProposalId] : undefined,
    query: {
      enabled: isNounsResolver && !resolved && nounsProposalId !== undefined,
    },
  });

  const canResolveNouns = Boolean(
    isNounsResolver &&
      !resolved &&
      nounsCanResolveData &&
      nounsCanResolveData[0] === true && // ready
      nounsCanResolveData[1] === false, // not a dead market
  );

  // Show tip button for Nouns if balance is low
  const showNounsTipButton = Boolean(
    isNounsResolver && nounsResolverBalance && nounsTipPerAction && nounsResolverBalance.value < nounsTipPerAction * 2n,
  );

  // Fetch BETHPM bet data (target amount and deadline)
  const { data: bethBetData } = useReadContract({
    address: BETH_PM_RESOLVER_ADDRESS as `0x${string}`,
    abi: BETHPMResolverAbi,
    functionName: "bets",
    args: [marketId],
    query: {
      enabled: isBETHPMResolver,
    },
  });

  // Fetch current BETH totalBurned
  const { data: bethTotalBurned } = useReadContract({
    address: BETH_PM_RESOLVER_ADDRESS as `0x${string}`,
    abi: BETHPMResolverAbi,
    functionName: "totalBurned",
    query: {
      enabled: isBETHPMResolver,
    },
  });

  // Fetch UNISUPPLYPM bet data (target amount and deadline)
  const { data: uniSupplyBetData } = useReadContract({
    address: UNISUPPLY_PM_RESOLVER_ADDRESS as `0x${string}`,
    abi: UNISUPPLYPMResolverAbi,
    functionName: "bets",
    args: [marketId],
    query: {
      enabled: isUNISUPPLYPMResolver,
    },
  });

  // Fetch current UNI totalSupply
  const { data: uniTotalSupply } = useReadContract({
    address: UNISUPPLY_PM_RESOLVER_ADDRESS as `0x${string}`,
    abi: UNISUPPLYPMResolverAbi,
    functionName: "totalSupply",
    query: {
      enabled: isUNISUPPLYPMResolver,
    },
  });

  // Fetch BUNNIBOUNTYPM bet data (target amount and deadline)
  const { data: bunniBountyBetData } = useReadContract({
    address: BUNNIBOUNTYPM_RESOLVER_ADDRESS as `0x${string}`,
    abi: BUNNIBOUNTYPMResolverAbi,
    functionName: "bets",
    args: [marketId],
    query: {
      enabled: isBUNNIBOUNTYPMResolver,
    },
  });

  // Fetch current bounty balance
  const { data: bunniBountyBalance } = useReadContract({
    address: BUNNIBOUNTYPM_RESOLVER_ADDRESS as `0x${string}`,
    abi: BUNNIBOUNTYPMResolverAbi,
    functionName: "bountyBalance",
    query: {
      enabled: isBUNNIBOUNTYPMResolver,
    },
  });

  // Fetch UniV4FeeSwitchPM deadline data
  const { data: uniV4FeeSwitchDeadline } = useReadContract({
    address: UNIV4_FEE_SWITCH_PM_RESOLVER_ADDRESS as `0x${string}`,
    abi: UniV4FeeSwitchPMResolverAbi,
    functionName: "deadline",
    args: [marketId],
    query: {
      enabled: isUniV4FeeSwitchPMResolver,
    },
  });

  // Fetch current Uniswap V4 protocolFeeController
  const { data: uniV4ProtocolFeeController } = useReadContract({
    address: UNIV4_FEE_SWITCH_PM_RESOLVER_ADDRESS as `0x${string}`,
    abi: UniV4FeeSwitchPMResolverAbi,
    functionName: "protocolFeeController",
    query: {
      enabled: isUniV4FeeSwitchPMResolver,
    },
  });

  //  Resolve and tip transaction handling
  const {
    writeContract: writeResolve,
    data: resolveHash,
    isPending: isResolvePending,
    error: resolveError,
  } = useWriteContract();
  const { isSuccess: isResolveSuccess } = useWaitForTransactionReceipt({
    hash: resolveHash,
  });

  const { writeContract: writeTip, data: tipHash, isPending: isTipPending, error: tipError } = useWriteContract();
  const { isSuccess: isTipSuccess } = useWaitForTransactionReceipt({
    hash: tipHash,
  });

  // Fetch market details to get closing time and canAccelerateClosing
  const { data: marketData, refetch: refetchMarketData } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: marketType === "amm" ? PredictionAMMAbi : PredictionMarketAbi,
    functionName: "markets",
    args: [marketId],
  });

  const canAccelerateClosing = marketData ? Boolean(marketData[5]) : false;

  // Calculate closing time (with Nouns estimation based on eval block)
  const closingTime = useMemo(() => {
    // First check if there's an explicit closing time from market data
    const explicitClosingTime = marketData ? Number(marketData[4]) : undefined;
    if (explicitClosingTime) return explicitClosingTime;

    // For Nouns markets, calculate estimated closing time based on eval block
    if (isNounsResolver && description && currentBlockNumber) {
      const evalBlock = extractNounsEvalBlock(description);
      console.log("Nouns Debug:", {
        hasDescription: !!description,
        evalBlock,
        currentBlockNumber: Number(currentBlockNumber),
        descriptionPreview: description.substring(0, 200),
      });
      if (evalBlock) {
        const currentBlock = Number(currentBlockNumber);
        if (evalBlock > currentBlock) {
          const blocksRemaining = evalBlock - currentBlock;
          const secondsRemaining = blocksRemaining * 12; // ~12 seconds per block on Ethereum
          const calculatedTime = Math.floor(Date.now() / 1000) + secondsRemaining;
          console.log("Calculated Nouns closing time:", calculatedTime, new Date(calculatedTime * 1000));
          return calculatedTime;
        } else {
          console.log("Eval block already passed:", evalBlock, "vs", currentBlock);
        }
      } else {
        console.log("No evalBlock found in description");
      }
    }

    return undefined;
  }, [marketData, isNounsResolver, description, currentBlockNumber]);

  // Calculate accurate payout per share: pot / winning shares
  // For AMM markets, use circulating supply (totalSupply - reserves)
  // For Parimutuel markets, use total supply
  let winningShares: bigint;
  if (marketType === "amm" && rYes !== undefined && rNo !== undefined) {
    // AMM: winning circulating shares = totalSupply - poolReserves
    const yesCirculating = yesSupply - rYes;
    const noCirculating = noSupply - rNo;
    winningShares = outcome ? yesCirculating : noCirculating;
  } else {
    // Parimutuel: winning total supply
    winningShares = outcome ? yesSupply : noSupply;
  }

  const calculatedPayoutPerShare =
    resolved && winningShares > 0n
      ? (pot * BigInt(1e18)) / winningShares // Scale by 1e18 to maintain precision (same as contract's Q)
      : payoutPerShare; // Fallback to contract value if not resolved or no winning shares

  const isClosed = closingTime ? Date.now() / 1000 >= closingTime : false;
  const isTradingDisabled = resolved || isClosed;

  const hasPosition = userYesBalance > 0n || userNoBalance > 0n;
  const canClaim = resolved && userClaimable > 0n;

  const handleClaim = () => {
    if (!address) {
      toast.error("Please connect your wallet");
      return;
    }
    writeContract({
      address: contractAddress as `0x${string}`,
      abi: marketType === "amm" ? PredictionAMMAbi : PredictionMarketAbi,
      functionName: "claim",
      args: [marketId, address],
    });
  };

  const handleCopyMarketId = () => {
    navigator.clipboard.writeText(marketId.toString());
    setIsCopied(true);
    toast.success("Market ID copied!");
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleResolve = () => {
    if (isEthWentUpResolver) {
      writeResolve({
        address: ETH_WENT_UP_RESOLVER_ADDRESS as `0x${string}`,
        abi: EthWentUpResolverAbi,
        functionName: "resolve",
      });
    } else if (isEthWentUpResolverV2) {
      writeResolve({
        address: ETH_WENT_UP_RESOLVER_V2_ADDRESS as `0x${string}`,
        abi: EthWentUpResolverAbi,
        functionName: "resolve",
      });
    } else if (isCoinflipResolver) {
      writeResolve({
        address: COINFLIP_RESOLVER_ADDRESS as `0x${string}`,
        abi: CoinflipResolverAbi,
        functionName: "resolve",
      });
    } else if (isNounsResolver && nounsProposalId !== undefined) {
      writeResolve({
        address: NOUNS_PASS_VOTING_RESOLVER_ADDRESS as `0x${string}`,
        abi: NounsPassVotingResolverAbi,
        functionName: "poke",
        args: [nounsProposalId],
      });
    }
  };

  const handleTip = () => {
    if (isEthWentUpResolver && tipPerResolve) {
      writeTip({
        address: ETH_WENT_UP_RESOLVER_ADDRESS as `0x${string}`,
        abi: EthWentUpResolverAbi,
        functionName: "fundTips",
        value: tipPerResolve,
      });
    } else if (isEthWentUpResolverV2 && tipPerResolveV2) {
      writeTip({
        address: ETH_WENT_UP_RESOLVER_V2_ADDRESS as `0x${string}`,
        abi: EthWentUpResolverAbi,
        functionName: "fundTips",
        value: tipPerResolveV2,
      });
    } else if (isCoinflipResolver && coinflipTipPerResolve) {
      writeTip({
        address: COINFLIP_RESOLVER_ADDRESS as `0x${string}`,
        abi: CoinflipResolverAbi,
        functionName: "fundTips",
        value: coinflipTipPerResolve,
      });
    } else if (isNounsResolver && nounsTipPerAction) {
      writeTip({
        address: NOUNS_PASS_VOTING_RESOLVER_ADDRESS as `0x${string}`,
        abi: NounsPassVotingResolverAbi,
        functionName: "fundTips",
        value: nounsTipPerAction,
      });
    }
  };

  useEffect(() => {
    if (isClaimSuccess && claimHash && toastedClaim.current !== claimHash) {
      toastedClaim.current = claimHash;
      toast.success("Claim successful!");
      if (onClaimSuccess) onClaimSuccess();
    }
  }, [isClaimSuccess, claimHash, onClaimSuccess]);

  useEffect(() => {
    if (claimError && toastedClaimError.current !== claimError) {
      toastedClaimError.current = claimError;

      // Handle user rejection silently
      if (isUserRejectionError(claimError)) {
        return;
      }

      // Show actual errors
      const errorMessage = (claimError as any)?.shortMessage ?? claimError?.message ?? "";
      toast.error(errorMessage || "Claim failed");
    }
  }, [claimError]);

  useEffect(() => {
    if (isResolveSuccess && resolveHash && toastedResolve.current !== resolveHash) {
      toastedResolve.current = resolveHash;
      toast.success("Market resolved! Keeper tip paid.");
      refetchMarketData();
      if (onClaimSuccess) onClaimSuccess();
    }
  }, [isResolveSuccess, resolveHash, refetchMarketData, onClaimSuccess]);

  useEffect(() => {
    if (resolveError && toastedResolveError.current !== resolveError) {
      toastedResolveError.current = resolveError;

      // Handle user rejection silently
      if (isUserRejectionError(resolveError)) {
        return;
      }

      // Show actual errors
      const errorMessage = (resolveError as any)?.shortMessage ?? resolveError?.message ?? "";
      toast.error(errorMessage || "Resolve failed");
    }
  }, [resolveError]);

  useEffect(() => {
    if (isTipSuccess && tipHash && toastedTip.current !== tipHash) {
      toastedTip.current = tipHash;
      toast.success("Tip added successfully! Thank you for supporting keepers.");
    }
  }, [isTipSuccess, tipHash]);

  useEffect(() => {
    if (tipError && toastedTipError.current !== tipError) {
      toastedTipError.current = tipError;

      // Handle user rejection silently
      if (isUserRejectionError(tipError)) {
        return;
      }

      // Show actual errors
      const errorMessage = (tipError as any)?.shortMessage ?? tipError?.message ?? "";
      toast.error(errorMessage || "Tip failed");
    }
  }, [tipError]);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        if (!description) return;

        // For perpetual oracle markets, use onchain description directly
        if (isPerpetualOracle) {
          const oracleMetadata = extractOracleMetadata(description);
          setMetadata(oracleMetadata);
          return;
        }

        let url = formatImageURL(description);

        const response = await fetch(url);
        const data = await response.json();

        let imageUrl = formatImageURL(data.image || "");

        // Check if the image URL might be another JSON metadata file or IPFS directory
        // This happens with some NFT metadata standards where image field points to more metadata
        if (imageUrl && !imageUrl.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i)) {
          try {
            const imageResponse = await fetch(imageUrl);
            const contentType = imageResponse.headers.get("content-type");

            // Check if it's JSON metadata
            if (contentType && contentType.includes("application/json")) {
              const imageData = await imageResponse.json();

              if (imageData.image) {
                imageUrl = formatImageURL(imageData.image);
              }
            }
            // Check if it's an IPFS directory listing (HTML)
            else if (contentType && contentType.includes("text/html")) {
              const html = await imageResponse.text();

              // Extract all href values that are not data URIs, parent directories, or the current directory
              const hrefMatches = html.matchAll(/href="([^"]+)"/gi);
              const files: string[] = [];

              for (const match of hrefMatches) {
                const href = match[1];
                // Skip data URIs, parent directory (..), current directory (.), directories (ending with /), and full URLs
                if (
                  !href.startsWith("data:") &&
                  !href.startsWith("http://") &&
                  !href.startsWith("https://") &&
                  href !== ".." &&
                  href !== "." &&
                  !href.endsWith("/")
                ) {
                  files.push(href);
                }
              }

              let filePath = null;

              // First try with common image extensions
              filePath = files.find((f) => /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(f));

              // If no match, try to find files with "image" in the name (common pattern)
              if (!filePath) {
                filePath = files.find((f) => /image/i.test(f));
              }

              // If still no match, take the first file
              if (!filePath && files.length > 0) {
                filePath = files[0];
              }

              if (filePath) {
                // Check if the path is absolute (starts with /)
                if (filePath.startsWith("/")) {
                  // Use the gateway base URL + the absolute path
                  const gatewayBase = imageUrl.split("/ipfs/")[0];
                  imageUrl = gatewayBase + filePath;
                } else {
                  // Relative path, append to the directory URL
                  imageUrl = imageUrl.endsWith("/") ? imageUrl + filePath : imageUrl + "/" + filePath;
                }
              }
            }
          } catch (nestedError) {
            // If fetching as JSON fails, the URL is likely a direct image, use it as-is
          }
        }

        setMetadata({
          name: data.name || "Unnamed Market",
          symbol: data.symbol || "",
          description: data.description || "",
          image: imageUrl,
        });
      } catch (error) {
        console.error("Failed to fetch metadata:", error);
        setMetadata({
          name: "Market #" + marketId.toString(),
          symbol: "",
          description: "",
          image: "",
        });
      }
    };

    fetchMetadata();
  }, [description, marketId, isPerpetualOracle]);

  if (!metadata) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 animate-pulse">
        <div className="h-32 bg-muted rounded-lg mb-3" />
        <div className="h-4 bg-muted rounded w-3/4 mb-2" />
        <div className="h-3 bg-muted rounded w-1/2" />
      </div>
    );
  }

  // For AMM markets, use pool reserves for odds; for parimutuel, use total supply
  // AMM odds formula (from PAMM.sol impliedYesProb):
  //   YES probability = rNo / (rYes + rNo)
  //   NO probability = rYes / (rYes + rNo)
  // This is because reserves are inversely related to probability in a CPMM
  let yesPercent: number;
  let noPercent: number;

  if (marketType === "amm" && rYes !== undefined && rNo !== undefined) {
    const totalReserves = rYes + rNo;
    if (totalReserves > 0n) {
      // YES probability uses rNo in numerator (inverse relationship)
      // Use high precision calculation to avoid BigInt truncation
      yesPercent = (Number(rNo) / Number(totalReserves)) * 100;
      noPercent = 100 - yesPercent;
    } else {
      yesPercent = 50;
      noPercent = 50;
    }
  } else {
    // Parimutuel markets: use total supply directly
    const totalSupply = yesSupply + noSupply;
    yesPercent = totalSupply > 0n ? (Number(yesSupply) / Number(totalSupply)) * 100 : 50;
    noPercent = 100 - yesPercent;
  }

  return (
    <>
      <div className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-xl hover:border-border/80 transition-all duration-300 group">
        {/* Image Header with Overlay */}
        <div className="relative">
          {metadata.image && !imageError ? (
            <img
              src={metadata.image}
              alt={metadata.name}
              className="w-full h-40 object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-40 bg-gradient-to-br from-purple-400 via-pink-400 to-blue-400 flex items-center justify-center">
              <span className="text-5xl">🔮</span>
            </div>
          )}

          {/* Market Type Badge - Floating on Image */}
          <div className="absolute top-3 right-3">
            <Badge
              className={`${
                marketType === "amm"
                  ? "bg-blue-500/90 hover:bg-blue-500 backdrop-blur-sm text-white border-0"
                  : "bg-purple-500/90 hover:bg-purple-500 backdrop-blur-sm text-white border-0"
              } font-semibold shadow-lg`}
            >
              {marketType === "amm" ? "AMM Pool" : "Parimutuel"}
            </Badge>
          </div>

          {/* Resolved Badge - Floating on Image */}
          {resolved && (
            <div className="absolute top-3 left-3">
              <Badge
                className={`${
                  outcome
                    ? "bg-green-500/90 backdrop-blur-sm text-white border-0"
                    : "bg-red-500/90 backdrop-blur-sm text-white border-0"
                } font-semibold shadow-lg`}
              >
                {outcome ? "✓ YES WON" : "✗ NO WON"}
              </Badge>
            </div>
          )}

          {/* Quick Trade Buttons - Appears on Hover (only for active markets) */}
          {!resolved && !isTradingDisabled && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end p-4">
              <div className="w-full grid grid-cols-2 gap-2">
                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setInitialPosition("yes");
                    setIsModalOpen(true);
                  }}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-6 text-base shadow-lg hover:shadow-xl transition-all"
                  size="lg"
                >
                  Buy YES
                </Button>
                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setInitialPosition("no");
                    setIsModalOpen(true);
                  }}
                  className="bg-rose-500 hover:bg-rose-600 text-white font-bold py-6 text-base shadow-lg hover:shadow-xl transition-all"
                  size="lg"
                >
                  Buy NO
                </Button>
              </div>
            </div>
          )}

          {/* Action Buttons - Share and Favorite */}
          <div className="absolute bottom-3 right-3 flex gap-2">
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleShare();
              }}
              variant="secondary"
              size="sm"
              className="h-8 w-8 p-0 bg-background/95 hover:bg-accent hover:text-accent-foreground border border-border/50 backdrop-blur-sm shadow-lg transition-all"
            >
              <Share2 className="h-4 w-4" />
            </Button>
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFavorite();
              }}
              variant="secondary"
              size="sm"
              className={`h-8 w-8 p-0 backdrop-blur-sm shadow-lg transition-all ${
                isFavorite
                  ? "bg-amber-500 hover:bg-amber-600 text-white border border-amber-600/50"
                  : "bg-background/95 hover:bg-accent hover:text-accent-foreground border border-border/50"
              }`}
            >
              <Star className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Title Section */}
          <div>
            <Link
              to="/predict/$marketType/$marketId"
              params={{
                marketType: marketType,
                marketId: marketId.toString(),
              }}
              className="block group/link"
            >
              <h3 className="font-bold text-base line-clamp-2 group-hover/link:text-primary transition-colors">
                {metadata.name}
              </h3>
            </Link>
            {metadata.description && (
              <div>
                <div
                  className={`text-xs text-muted-foreground markdown-content transition-all ${
                    isDescriptionExpanded ? "max-h-96 overflow-y-auto" : "line-clamp-3"
                  }`}
                >
                  <ReactMarkdown
                    components={{
                      // Customize rendering to fit card design
                      p: ({ children }: { children?: React.ReactNode }) => <p className="mb-1 last:mb-0">{children}</p>,
                      a: ({
                        children,
                        href,
                      }: {
                        children?: React.ReactNode;
                        href?: string;
                      }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {children}
                        </a>
                      ),
                      strong: ({
                        children,
                      }: {
                        children?: React.ReactNode;
                      }) => <strong className="font-semibold text-foreground">{children}</strong>,
                      em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
                      code: ({ children }: { children?: React.ReactNode }) => (
                        <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                      ),
                      ul: ({ children }: { children?: React.ReactNode }) => (
                        <ul className="list-disc list-inside space-y-0.5">{children}</ul>
                      ),
                      ol: ({ children }: { children?: React.ReactNode }) => (
                        <ol className="list-decimal list-inside space-y-0.5">{children}</ol>
                      ),
                      li: ({ children }: { children?: React.ReactNode }) => <li className="text-xs">{children}</li>,
                      h1: ({ children }: { children?: React.ReactNode }) => (
                        <h1 className="text-base font-bold mt-2 mb-1">{children}</h1>
                      ),
                      h2: ({ children }: { children?: React.ReactNode }) => (
                        <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>
                      ),
                      h3: ({ children }: { children?: React.ReactNode }) => (
                        <h3 className="text-xs font-semibold mt-1 mb-0.5">{children}</h3>
                      ),
                      blockquote: ({
                        children,
                      }: {
                        children?: React.ReactNode;
                      }) => <blockquote className="border-l-2 border-primary pl-2 italic my-1">{children}</blockquote>,
                    }}
                  >
                    {metadata.description}
                  </ReactMarkdown>
                </div>
                <button
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                  className="text-xs text-primary hover:underline mt-1 focus:outline-none"
                >
                  {isDescriptionExpanded ? "Show less" : "Read more..."}
                </button>
              </div>
            )}
          </div>

          {closingTime && <MarketCountdown closingTime={closingTime} resolved={resolved} />}

          {/* ETH Price Market Info - Show Start and Current/Resolution Price */}
          {(isEthWentUpResolver || isEthWentUpResolverV2) &&
            (ethWentUpEpochData || ethWentUpV2EpochData) &&
            (() => {
              const epochData = isEthWentUpResolver ? ethWentUpEpochData : ethWentUpV2EpochData;
              if (!epochData) return null;
              // Extract start price and decimals from epoch data
              const startPrice = epochData[3]; // startPrice (uint256)
              const startDecimals = epochData[2]; // startDecimals (uint8)

              // Only show if we have valid start price data
              if (!startPrice || startPrice === 0n) return null;

              // Format prices for display (convert to dollars with 2 decimal places)
              const formatPrice = (price: bigint, decimals: number) => {
                const priceNum = Number(price) / Math.pow(10, decimals);
                return priceNum.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                });
              };

              const startPriceFormatted = formatPrice(startPrice, startDecimals);

              return (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded p-2 space-y-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />
                    <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-300">ETH Price Oracle</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div className="flex justify-between items-center">
                      <span>Start Price:</span>
                      <span className="font-mono font-semibold">${startPriceFormatted}</span>
                    </div>
                    {resolved ? (
                      // For resolved markets, show the outcome
                      <div className="flex justify-between items-center">
                        <span>Resolution:</span>
                        <span
                          className={`font-mono font-semibold ${outcome ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                        >
                          Price went {outcome ? "UP ↑" : "DOWN ↓"}
                        </span>
                      </div>
                    ) : currentEthPriceData ? (
                      // For active markets with price data, show current price and change
                      (() => {
                        const currentPrice = currentEthPriceData[1]; // answer
                        const currentDecimals = 8; // Chainlink ETH/USD uses 8 decimals
                        const currentPriceFormatted = formatPrice(BigInt(currentPrice.toString()), currentDecimals);

                        // Calculate price change
                        const priceWentUp =
                          currentPrice > startPrice * BigInt(Math.pow(10, currentDecimals - startDecimals));
                        const priceDiff =
                          Number(currentPrice) / Math.pow(10, currentDecimals) -
                          Number(startPrice) / Math.pow(10, startDecimals);
                        const priceChangePercent =
                          (priceDiff / (Number(startPrice) / Math.pow(10, startDecimals))) * 100;

                        return (
                          <>
                            <div className="flex justify-between items-center">
                              <span>Current Price:</span>
                              <span className="font-mono font-semibold flex items-center gap-1">
                                ${currentPriceFormatted}
                                {priceWentUp ? (
                                  <span className="text-green-600 dark:text-green-400 font-bold">↑</span>
                                ) : (
                                  <span className="text-red-600 dark:text-red-400 font-bold">↓</span>
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span>Change:</span>
                              <span
                                className={`font-mono font-semibold ${priceWentUp ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                              >
                                {priceWentUp ? "+" : ""}
                                {priceChangePercent.toFixed(2)}%
                              </span>
                            </div>
                          </>
                        );
                      })()
                    ) : null}
                    {!resolved && metadata && (metadata as any).resolveTime && (
                      <div className="flex justify-between items-center pt-1 border-t border-yellow-500/20">
                        <span>Resolves:</span>
                        <span className="font-mono text-[11px]">
                          {new Date((metadata as any).resolveTime * 1000).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    )}
                    {metadata && (metadata as any).rules && (
                      <div className="pt-0.5 text-[11px] italic opacity-80">{(metadata as any).rules}</div>
                    )}
                  </div>
                </div>
              );
            })()}

          {/* BETH Burn Market Info - Show Target and Current Burn Amount */}
          {isBETHPMResolver &&
            bethBetData &&
            bethTotalBurned !== undefined &&
            (() => {
              const targetAmount = bethBetData[0]; // amount (uint184)
              const deadline = bethBetData[1]; // deadline (uint72)
              const currentBurned = bethTotalBurned;

              // Only show if we have valid target amount
              if (!targetAmount || targetAmount === 0n) return null;

              // Format burn amounts (in ETH with 4 decimal places)
              const formatBurnAmount = (amount: bigint) => {
                return Number(formatEther(amount)).toFixed(4);
              };

              const targetFormatted = formatBurnAmount(targetAmount);
              const currentFormatted = formatBurnAmount(currentBurned);

              // Calculate progress percentage
              const progressPercent = (Number(currentBurned) / Number(targetAmount)) * 100;
              const isOnTrack = currentBurned >= targetAmount;

              return (
                <div className="bg-red-500/5 border border-red-500/20 rounded p-2 space-y-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    <span className="text-xs font-semibold text-red-700 dark:text-red-300">BETH Burn Oracle</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div className="flex justify-between items-center">
                      <span>Target Burn:</span>
                      <span className="font-mono font-semibold">{targetFormatted} ETH</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Current Burned:</span>
                      <span
                        className={`font-mono font-semibold ${isOnTrack ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                      >
                        {currentFormatted} ETH
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Progress:</span>
                      <span
                        className={`font-mono font-semibold ${isOnTrack ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                      >
                        {Math.min(progressPercent, 100).toFixed(2)}%{isOnTrack ? " ✓" : ""}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden mt-1">
                      <div
                        className={`h-full transition-all ${isOnTrack ? "bg-green-600 dark:bg-green-400" : "bg-red-600 dark:bg-red-400"}`}
                        style={{ width: `${Math.min(progressPercent, 100)}%` }}
                      />
                    </div>
                    {!resolved && Number(deadline) > 0 && (
                      <div className="flex justify-between items-center pt-1 border-t border-red-500/20">
                        <span>Deadline:</span>
                        <span className="font-mono text-[11px]">
                          {new Date(Number(deadline) * 1000).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    )}
                    {resolved && (
                      <div className="flex justify-between items-center pt-1 border-t border-red-500/20">
                        <span>Result:</span>
                        <span
                          className={`font-mono font-semibold ${outcome ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                        >
                          {outcome ? "Target Reached ✓" : "Target Missed ✗"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          {/* UNI Supply Market Info - Show Target and Current Supply */}
          {isUNISUPPLYPMResolver &&
            uniSupplyBetData &&
            uniTotalSupply !== undefined &&
            (() => {
              const targetAmount = uniSupplyBetData[0]; // amount (uint184)
              const deadline = uniSupplyBetData[1]; // deadline (uint72)
              const currentSupply = uniTotalSupply;

              // Only show if we have valid target amount
              if (!targetAmount || targetAmount === 0n) return null;

              // Format supply amounts (in tokens with scientific notation for readability)
              const formatSupplyAmount = (amount: bigint) => {
                const amountStr = amount.toString();
                // For very large numbers, show in scientific notation
                if (amountStr.length > 6) {
                  const exponent = amountStr.length - 1;
                  const coefficient = amountStr[0] + "." + amountStr.slice(1, 4);
                  return `${coefficient}e${exponent}`;
                }
                return amountStr;
              };

              const targetFormatted = formatSupplyAmount(targetAmount);
              const currentFormatted = formatSupplyAmount(currentSupply);

              // Calculate progress percentage
              const progressPercent = (Number(currentSupply) / Number(targetAmount)) * 100;
              const isOnTrack = currentSupply >= targetAmount;

              return (
                <div className="bg-pink-500/5 border border-pink-500/20 rounded p-2 space-y-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="h-3.5 w-3.5 text-pink-600 dark:text-pink-400" />
                    <span className="text-xs font-semibold text-pink-700 dark:text-pink-300">UNI Supply Oracle</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div className="flex justify-between items-center">
                      <span>Target Supply:</span>
                      <span className="font-mono font-semibold">{targetFormatted}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Current Supply:</span>
                      <span
                        className={`font-mono font-semibold ${isOnTrack ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                      >
                        {currentFormatted}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Progress:</span>
                      <span
                        className={`font-mono font-semibold ${isOnTrack ? "text-green-600 dark:text-green-400" : "text-pink-600 dark:text-pink-400"}`}
                      >
                        {Math.min(progressPercent, 100).toFixed(2)}%{isOnTrack ? " ✓" : ""}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden mt-1">
                      <div
                        className={`h-full transition-all ${isOnTrack ? "bg-green-600 dark:bg-green-400" : "bg-pink-600 dark:bg-pink-400"}`}
                        style={{ width: `${Math.min(progressPercent, 100)}%` }}
                      />
                    </div>
                    {!resolved && Number(deadline) > 0 && (
                      <div className="flex justify-between items-center pt-1 border-t border-pink-500/20">
                        <span>Deadline:</span>
                        <span className="font-mono text-[11px]">
                          {new Date(Number(deadline) * 1000).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    )}
                    {resolved && (
                      <div className="flex justify-between items-center pt-1 border-t border-pink-500/20">
                        <span>Result:</span>
                        <span
                          className={`font-mono font-semibold ${outcome ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                        >
                          {outcome ? "Target Reached ✓" : "Target Missed ✗"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          {/* Bunni Bounty Market Info - Show Target and Current Balance */}
          {isBUNNIBOUNTYPMResolver &&
            bunniBountyBetData &&
            bunniBountyBalance !== undefined &&
            (() => {
              const targetAmount = bunniBountyBetData[0]; // amount (uint184) - threshold below which bounty is considered paid
              const deadline = bunniBountyBetData[1]; // deadline (uint72)
              const currentBalance = bunniBountyBalance;

              // Only show if we have valid target amount
              if (!targetAmount || targetAmount === 0n) return null;

              // Format balance amounts (in ETH with 4 decimal places)
              const formatBountyAmount = (amount: bigint) => {
                return Number(formatEther(amount)).toFixed(4);
              };

              const targetFormatted = formatBountyAmount(targetAmount);
              const currentFormatted = formatBountyAmount(currentBalance);

              // Calculate how close we are to the threshold
              // For bounty payout prediction: YES wins if balance DROPS below threshold (bounty paid out)
              const balanceRatio = Number(currentBalance) / Number(targetAmount);
              const bountyPaidOut = currentBalance < targetAmount;

              return (
                <div className="bg-sky-500/5 border border-sky-500/20 rounded p-2 space-y-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-base">🐰</span>
                    <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">Bunni Bounty Oracle</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div className="text-[11px] italic mb-1 text-sky-700 dark:text-sky-400">
                      Predicting if bounty is fulfilled and paid out
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Payout Threshold:</span>
                      <span className="font-mono font-semibold">&lt; {targetFormatted} ETH</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Current Balance:</span>
                      <span
                        className={`font-mono font-semibold ${bountyPaidOut ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                      >
                        {currentFormatted} ETH
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Status:</span>
                      <span
                        className={`font-mono font-semibold ${bountyPaidOut ? "text-green-600 dark:text-green-400" : "text-sky-600 dark:text-sky-400"}`}
                      >
                        {bountyPaidOut ? "Bounty Paid Out ✓" : "Bounty Active"}
                      </span>
                    </div>
                    {/* Balance indicator bar */}
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden mt-1">
                      <div
                        className={`h-full transition-all ${bountyPaidOut ? "bg-green-600 dark:bg-green-400" : "bg-sky-600 dark:bg-sky-400"}`}
                        style={{ width: `${Math.min(balanceRatio * 100, 100)}%` }}
                      />
                    </div>
                    {!resolved && Number(deadline) > 0 && (
                      <div className="flex justify-between items-center pt-1 border-t border-sky-500/20">
                        <span>Deadline:</span>
                        <span className="font-mono text-[11px]">
                          {new Date(Number(deadline) * 1000).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    )}
                    {resolved && (
                      <div className="flex justify-between items-center pt-1 border-t border-sky-500/20">
                        <span>Result:</span>
                        <span
                          className={`font-mono font-semibold ${outcome ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                        >
                          {outcome ? "Bounty Paid Out ✓" : "Bounty Not Paid ✗"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          {/* UniV4 Fee Switch Market Info - Show Deadline and Fee Controller Status */}
          {isUniV4FeeSwitchPMResolver &&
            uniV4FeeSwitchDeadline !== undefined &&
            (() => {
              const deadline = Number(uniV4FeeSwitchDeadline);
              const feeControllerSet =
                uniV4ProtocolFeeController !== undefined &&
                uniV4ProtocolFeeController !== "0x0000000000000000000000000000000000000000";

              // Only show if we have valid deadline
              if (!deadline || deadline === 0) return null;

              return (
                <div className="bg-pink-500/5 border border-pink-500/20 rounded p-2 space-y-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-base">🦄</span>
                    <span className="text-xs font-semibold text-pink-700 dark:text-pink-300">
                      Uniswap V4 Fee Switch Oracle
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div className="text-[11px] italic mb-1 text-pink-700 dark:text-pink-400">
                      Predicting if Uniswap V4 protocol fee switch is activated
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Fee Controller:</span>
                      <span
                        className={`font-mono font-semibold ${feeControllerSet ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                      >
                        {feeControllerSet ? "Set ✓" : "Not Set"}
                      </span>
                    </div>
                    {uniV4ProtocolFeeController && feeControllerSet && (
                      <div className="flex justify-between items-center">
                        <span>Controller Address:</span>
                        <a
                          href={`https://etherscan.io/address/${uniV4ProtocolFeeController}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[10px] text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1"
                        >
                          {`${String(uniV4ProtocolFeeController).slice(0, 6)}...${String(uniV4ProtocolFeeController).slice(-4)}`}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span>Status:</span>
                      <span
                        className={`font-mono font-semibold ${feeControllerSet ? "text-green-600 dark:text-green-400" : "text-pink-600 dark:text-pink-400"}`}
                      >
                        {feeControllerSet ? "Fee Switch ON" : "Fee Switch OFF"}
                      </span>
                    </div>
                    {/* Status indicator */}
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden mt-1">
                      <div
                        className={`h-full transition-all ${feeControllerSet ? "bg-green-600 dark:bg-green-400" : "bg-pink-600 dark:bg-pink-400"}`}
                        style={{ width: feeControllerSet ? "100%" : "0%" }}
                      />
                    </div>
                    {!resolved && deadline > 0 && (
                      <div className="flex justify-between items-center pt-1 border-t border-pink-500/20">
                        <span>Deadline:</span>
                        <span className="font-mono text-[11px]">
                          {new Date(deadline * 1000).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    )}
                    {resolved && (
                      <div className="flex justify-between items-center pt-1 border-t border-pink-500/20">
                        <span>Result:</span>
                        <span
                          className={`font-mono font-semibold ${outcome ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                        >
                          {outcome ? "Fee Switch Activated ✓" : "Fee Switch Not Activated ✗"}
                        </span>
                      </div>
                    )}
                    <div className="pt-1 text-[10px] italic opacity-70 text-pink-700 dark:text-pink-400">
                      Note: Market may resolve early if fee controller is set before deadline
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* Perpetual Oracle Info - Timing and Rules */}
          {isPerpetualOracle && metadata && ((metadata as any).resolveTime || (metadata as any).nounsProposalId) && (
            <div
              className={`${
                isCoinflipResolver
                  ? "bg-blue-500/5 border border-blue-500/20"
                  : isNounsResolver
                    ? "bg-pink-500/5 border border-pink-500/20"
                    : "bg-yellow-500/5 border border-yellow-500/20"
              } rounded p-2 space-y-1`}
            >
              <div className="flex items-center gap-1.5">
                <Sparkles
                  className={`h-3.5 w-3.5 ${
                    isCoinflipResolver
                      ? "text-blue-600 dark:text-blue-400"
                      : isNounsResolver
                        ? "text-pink-600 dark:text-pink-400"
                        : "text-yellow-600 dark:text-yellow-400"
                  }`}
                />
                <span
                  className={`text-xs font-semibold ${
                    isCoinflipResolver
                      ? "text-blue-700 dark:text-blue-300"
                      : isNounsResolver
                        ? "text-pink-700 dark:text-pink-300"
                        : "text-yellow-700 dark:text-yellow-300"
                  }`}
                >
                  Automated Oracle Market
                </span>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {isNounsResolver && (metadata as any).nounsProposalId && (
                  <div className="flex justify-between">
                    <span>Proposal ID:</span>
                    <a
                      href={`https://nouns.wtf/vote/${(metadata as any).nounsProposalId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1"
                    >
                      #{(metadata as any).nounsProposalId}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                )}
                {isNounsResolver &&
                  (metadata as any).nounsEvalBlock &&
                  (() => {
                    const evalBlock = Number((metadata as any).nounsEvalBlock);
                    const currentBlock = currentBlockNumber ? Number(currentBlockNumber) : null;

                    // Estimate timestamp based on Ethereum's ~12 second block time
                    let estimatedTime: string | null = null;
                    if (currentBlock && evalBlock > currentBlock) {
                      const blocksRemaining = evalBlock - currentBlock;
                      const secondsRemaining = blocksRemaining * 12;
                      const estimatedTimestamp = Date.now() + secondsRemaining * 1000;
                      const date = new Date(estimatedTimestamp);
                      estimatedTime = date.toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      });
                    }

                    return (
                      <>
                        <div className="flex justify-between">
                          <span>Eval Block:</span>
                          <span className="font-mono text-[10px]">{evalBlock.toLocaleString()}</span>
                        </div>
                        {estimatedTime && (
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Est. End:</span>
                            <span>{estimatedTime}</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                {(metadata as any).resolveTime && !isNounsResolver && (
                  <div className="flex justify-between">
                    <span>{isCoinflipResolver ? "Closes:" : "Resolves:"}</span>
                    <span className="font-mono">
                      {new Date((metadata as any).resolveTime * 1000).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                )}
                {isCoinflipResolver && (metadata as any).targetBlocks && (metadata as any).targetBlocks.length > 0 && (
                  <div className="flex justify-between">
                    <span>Target Blocks:</span>
                    <span className="font-mono text-[10px]">{(metadata as any).targetBlocks.join(", ")}</span>
                  </div>
                )}
                {(metadata as any).rules && (
                  <div className="pt-0.5 text-[11px] italic opacity-80">{(metadata as any).rules}</div>
                )}
              </div>
            </div>
          )}

          {/* Odds Display - Enhanced for Active Markets */}
          {!resolved && (
            <div className="bg-gradient-to-br from-muted/30 to-muted/10 rounded-lg p-3 space-y-2 border border-border/50">
              <div className="flex justify-between items-center text-sm font-semibold">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                  <span className="text-emerald-600 dark:text-emerald-400">YES {yesPercent.toFixed(2)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-rose-600 dark:text-rose-400">NO {noPercent.toFixed(2)}%</span>
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                </div>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-muted/50 shadow-inner">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500"
                  style={{ width: `${yesPercent}%` }}
                />
                <div
                  className="bg-gradient-to-r from-rose-500 to-rose-600 transition-all duration-500"
                  style={{ width: `${noPercent}%` }}
                />
              </div>
              {/* Pool/Supply Information */}
              <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
                <span>
                  {marketType === "amm" ? "Pool YES:" : "Total YES:"}{" "}
                  {Number(formatEther(marketType === "amm" && rYes !== undefined ? rYes : yesSupply)).toFixed(2)}
                </span>
                <span>
                  {marketType === "amm" ? "Pool NO:" : "Total NO:"}{" "}
                  {Number(formatEther(marketType === "amm" && rNo !== undefined ? rNo : noSupply)).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Market Info Section */}
          <div className="space-y-2">
            {/* User Position - Highlighted */}
            {hasPosition && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-semibold text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                  Your Position
                </div>
                <div className="space-y-1.5 text-xs">
                  {userYesBalance > 0n && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">YES shares</span>
                      <span className="font-mono font-semibold">{Number(formatEther(userYesBalance)).toFixed(4)}</span>
                    </div>
                  )}
                  {userNoBalance > 0n && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">NO shares</span>
                      <span className="font-mono font-semibold">{Number(formatEther(userNoBalance)).toFixed(4)}</span>
                    </div>
                  )}
                  {canClaim && (
                    <div className="flex justify-between items-center pt-1.5 border-t border-blue-200/50 dark:border-blue-800/50">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">Claimable</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {Number(formatEther(userClaimable)).toFixed(4)} wstETH
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Total Pool/Pot - Prominent Display */}
            <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground font-medium">
                  {marketType === "amm" ? "Total Pot (wstETH)" : "Prize Pool (wstETH)"}
                </span>
                <span className="font-mono font-bold text-sm">{Number(formatEther(pot)).toFixed(4)}</span>
              </div>
            </div>
            {/* Resolved Market Stats */}
            {resolved && calculatedPayoutPerShare > 0n && (
              <div className="bg-muted/30 rounded-lg p-3 border border-border/50 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Winning Side</span>
                  <span
                    className={`font-bold ${outcome ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
                  >
                    {outcome ? "YES" : "NO"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Winning Shares</span>
                  <span className="font-mono font-semibold">{Number(formatEther(winningShares)).toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-border/30">
                  <span className="text-muted-foreground font-medium">Payout Per Share</span>
                  <span className="font-mono font-bold">
                    {Number(formatEther(calculatedPayoutPerShare)).toFixed(4)} wstETH
                  </span>
                </div>
              </div>
            )}

            {/* Resolver Information */}
            <div className="bg-muted/20 rounded-lg p-2.5 border border-border/40">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-medium">Resolver</span>
                <div className="flex items-center gap-1.5">
                  <a
                    href={`https://etherscan.io/address/${resolver}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-primary transition-colors font-mono"
                    title={resolver}
                  >
                    {/* Prefer ENS name over generic "Trusted Resolver #X" labels */}
                    {ensName ||
                      (trustedResolverInfo?.name && !trustedResolverInfo.name.startsWith("Trusted Resolver #")
                        ? trustedResolverInfo.name
                        : null) ||
                      `${resolver.slice(0, 6)}...${resolver.slice(-4)}`}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {trustedResolverInfo && trustedResolverInfo.description ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">
                          {isPerpetualOracle ? (
                            <BadgeCheck className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                          ) : (
                            <BadgeCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          )}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs max-w-xs">{trustedResolverInfo.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : isPerpetualOracle ? (
                    <span title="Perpetual Oracle Resolver">
                      <BadgeCheck className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                    </span>
                  ) : isTrusted ? (
                    <BadgeCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  ) : null}
                </div>
              </div>
            </div>

            {/* Market ID - Compact */}
            <button
              onClick={handleCopyMarketId}
              className="w-full flex items-center justify-between px-2.5 py-1.5 bg-muted/10 hover:bg-muted/20 rounded border border-border/30 hover:border-border/60 transition-all group text-xs"
              title="Click to copy Market ID"
            >
              <span className="text-muted-foreground/60 group-hover:text-muted-foreground font-medium">Market ID</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-muted-foreground/80 group-hover:text-foreground">
                  {marketId.toString().slice(0, 8)}...{marketId.toString().slice(-6)}
                </span>
                {isCopied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3 opacity-40 group-hover:opacity-100" />
                )}
              </div>
            </button>
          </div>

          {/* Resolver Controls - only shown to the resolver */}
          {closingTime && (
            <ResolverControls
              marketId={marketId}
              contractAddress={contractAddress}
              marketType={marketType}
              resolver={resolver}
              closingTime={closingTime}
              canAccelerateClosing={canAccelerateClosing}
              resolved={resolved}
              onSuccess={() => {
                refetchMarketData();
                if (onClaimSuccess) onClaimSuccess();
              }}
            />
          )}

          {/* Perpetual Oracle Automation - Resolve Button */}
          {(canResolve || canResolveV2 || canResolveCoinflip || canResolveNouns) && (
            <div
              className={`${
                isCoinflipResolver
                  ? "bg-blue-500/10 border border-blue-500/30"
                  : isNounsResolver
                    ? "bg-pink-500/10 border border-pink-500/30"
                    : "bg-yellow-500/10 border border-yellow-500/30"
              } rounded p-2`}
            >
              <Button
                onClick={handleResolve}
                className={`w-full ${
                  isCoinflipResolver
                    ? "bg-blue-600 hover:bg-blue-700"
                    : isNounsResolver
                      ? "bg-pink-600 hover:bg-pink-700"
                      : "bg-yellow-600 hover:bg-yellow-700"
                } text-white`}
                size="sm"
                disabled={isResolvePending}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isResolvePending ? "Resolving..." : "Resolve Market (Earn Tip!)"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1 text-center">
                Automated market ready. Resolve to earn{" "}
                {isCoinflipResolver
                  ? coinflipTipPerResolve
                    ? formatEther(coinflipTipPerResolve)
                    : "0.001"
                  : isNounsResolver
                    ? nounsTipPerAction
                      ? formatEther(nounsTipPerAction)
                      : "0.001"
                    : isEthWentUpResolverV2
                      ? tipPerResolveV2
                        ? formatEther(tipPerResolveV2)
                        : "0.001"
                      : tipPerResolve
                        ? formatEther(tipPerResolve)
                        : "0.001"}{" "}
                ETH tip
              </p>
            </div>
          )}

          {/* Perpetual Oracle Tip Button - Subtle, only shown when balance is low */}
          {(showTipButton || showTipButtonV2 || showCoinflipTipButton || showNounsTipButton) && (
            <button
              onClick={handleTip}
              className={`w-full text-xs text-muted-foreground ${
                isCoinflipResolver
                  ? "hover:text-blue-600 dark:hover:text-blue-400"
                  : isNounsResolver
                    ? "hover:text-pink-600 dark:hover:text-pink-400"
                    : "hover:text-yellow-600 dark:hover:text-yellow-400"
              } transition-colors flex items-center justify-center gap-1 py-1 opacity-60 hover:opacity-100`}
              disabled={isTipPending}
              title="Add tip to incentivize keepers to resolve this market"
            >
              <Coins className="h-3 w-3" />
              {isTipPending
                ? "Adding tip..."
                : `Tip keepers ${
                    isCoinflipResolver
                      ? coinflipTipPerResolve
                        ? formatEther(coinflipTipPerResolve)
                        : "0.001"
                      : isNounsResolver
                        ? nounsTipPerAction
                          ? formatEther(nounsTipPerAction)
                          : "0.001"
                        : isEthWentUpResolverV2
                          ? tipPerResolveV2
                            ? formatEther(tipPerResolveV2)
                            : "0.001"
                          : tipPerResolve
                            ? formatEther(tipPerResolve)
                            : "0.001"
                  } ETH`}
            </button>
          )}

          {/* Action Buttons */}
          <div className="pt-2 border-t border-border/50">
            {canClaim ? (
              <Button
                onClick={handleClaim}
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold shadow-md hover:shadow-lg transition-all"
                size="lg"
              >
                <span className="text-base">Claim {Number(formatEther(userClaimable)).toFixed(4)} wstETH</span>
              </Button>
            ) : isTradingDisabled ? (
              <Button className="w-full" size="lg" disabled={true} variant="outline">
                {resolved ? "Market Resolved" : "Market Closed"}
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => {
                    setInitialPosition("yes");
                    setIsModalOpen(true);
                  }}
                  className="bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold flex flex-col items-center py-3 h-auto transition-all shadow-sm hover:shadow-md border-0"
                  size="sm"
                >
                  <span className="text-base">YES</span>
                  <span className="text-xs font-normal opacity-90">{yesPercent.toFixed(2)}%</span>
                </Button>
                <Button
                  onClick={() => {
                    setInitialPosition("no");
                    setIsModalOpen(true);
                  }}
                  className="bg-gradient-to-br from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-bold flex flex-col items-center py-3 h-auto transition-all shadow-sm hover:shadow-md border-0"
                  size="sm"
                >
                  <span className="text-base">NO</span>
                  <span className="text-xs font-normal opacity-90">{noPercent.toFixed(2)}%</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <TradeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        marketId={marketId}
        marketName={metadata.name}
        yesSupply={yesSupply}
        noSupply={noSupply}
        marketType={marketType}
        contractAddress={contractAddress}
        resolver={resolver}
        initialPosition={initialPosition}
        onTransactionSuccess={() => {
          // Refetch market data to update odds/reserves after transactions
          refetchMarketData();
          if (onClaimSuccess) onClaimSuccess();
        }}
      />
    </>
  );
};
