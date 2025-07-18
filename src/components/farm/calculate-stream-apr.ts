import { parseEther, parseUnits } from "viem";

interface CalculateStreamAprParams {
  rewardAmount: string; // The total reward amount as string (e.g., "60000")
  rewardTokenDecimals: number; // Decimals of the reward token (usually 18)
  rewardPriceInEth: number; // Price of reward token in ETH (e.g., 0.001)
  durationInDays: number; // Duration of the stream in days
  poolTvlInEth: number; // Total Value Locked in the pool in ETH
  totalShares?: bigint; // Current total shares in the pool (optional, defaults to 1 ETH)
}

interface StreamAprResult {
  farmApr: number; // The estimated farm APR as percentage
  dailyRewardRate: number; // Daily reward tokens emitted
  yearlyRewardValue: number; // Yearly reward value in ETH
  isValid: boolean; // Whether the calculation is valid
  error?: string; // Error message if calculation failed
}

const SECONDS_IN_YEAR = 365n * 24n * 60n * 60n;
const ACC_PRECISION = 1_000_000_000_000n; // 1e12
const EIGHTEEN_DECIMALS = 1_000_000_000_000_000_000n; // 1e18

/**
 * Calculate the estimated APR for a new farm stream
 * This mimics the calculation logic from useCombinedApy but for preview purposes
 */
export function calculateStreamApr({
  rewardAmount,
  rewardTokenDecimals,
  rewardPriceInEth,
  durationInDays,
  poolTvlInEth,
  totalShares,
}: CalculateStreamAprParams): StreamAprResult {
  try {
    // Input validation
    if (!rewardAmount || Number.parseFloat(rewardAmount) <= 0) {
      return {
        farmApr: 0,
        dailyRewardRate: 0,
        yearlyRewardValue: 0,
        isValid: false,
        error: "Invalid reward amount",
      };
    }

    if (durationInDays <= 0) {
      return {
        farmApr: 0,
        dailyRewardRate: 0,
        yearlyRewardValue: 0,
        isValid: false,
        error: "Invalid duration",
      };
    }

    if (poolTvlInEth <= 0) {
      return {
        farmApr: 0,
        dailyRewardRate: 0,
        yearlyRewardValue: 0,
        isValid: false,
        error: "Invalid pool TVL",
      };
    }

    if (rewardPriceInEth <= 0) {
      return {
        farmApr: 0,
        dailyRewardRate: 0,
        yearlyRewardValue: 0,
        isValid: false,
        error: "Invalid reward token price",
      };
    }

    // Parse reward amount with proper decimals
    const rewardAmountBigInt = parseUnits(
      rewardAmount,
      rewardTokenDecimals ?? 18,
    );

    // Use provided totalShares or default to 1 ETH worth of shares
    const safeTotalShares =
      totalShares && totalShares > 0n ? totalShares : parseEther("1");

    // Convert duration to seconds
    const durationInSeconds = BigInt(Math.floor(durationInDays * 24 * 60 * 60));

    // Calculate reward rate per second (similar to zChef contract)
    const rewardRate = rewardAmountBigInt / durationInSeconds;

    // Calculate reward per share per year (scaled by ACC_PRECISION like in the contract)
    const rewardPerSharePerYear =
      (rewardRate * SECONDS_IN_YEAR * ACC_PRECISION) / safeTotalShares;

    // Convert to human readable numbers for APR calculation
    const share = parseEther("1"); // 1 LP share
    const rewardPerSharePerYearWei = rewardPerSharePerYear / ACC_PRECISION;
    const tokensPerSharePerYear =
      Number(rewardPerSharePerYearWei) / Number(EIGHTEEN_DECIMALS);

    // Calculate yearly reward for 1 share
    const yearlyReward = tokensPerSharePerYear * Number(share);
    const yearlyRewardEthValue = yearlyReward * rewardPriceInEth;

    // Calculate the ETH value of 1 share (stake)
    const stakeEth = (Number(share) / Number(safeTotalShares)) * poolTvlInEth;

    // Calculate APR percentage
    let farmApr = 0;
    if (
      stakeEth > 0 &&
      !isNaN(yearlyRewardEthValue) &&
      !isNaN(stakeEth) &&
      isFinite(stakeEth)
    ) {
      farmApr = (yearlyRewardEthValue / stakeEth) * 100;

      // Validate the result
      if (isNaN(farmApr) || !isFinite(farmApr)) {
        farmApr = 0;
      }
    }

    // Calculate daily reward rate for display
    const dailyRewardRate = Number.parseFloat(rewardAmount) / durationInDays;

    return {
      farmApr: Math.max(0, farmApr), // Ensure non-negative
      dailyRewardRate,
      yearlyRewardValue: yearlyRewardEthValue,
      isValid: true,
    };
  } catch (error) {
    console.error("Error calculating stream APR:", error);
    return {
      farmApr: 0,
      dailyRewardRate: 0,
      yearlyRewardValue: 0,
      isValid: false,
      error: error instanceof Error ? error.message : "Calculation failed",
    };
  }
}

/**
 * Helper function to estimate APR with default/fallback values
 * Useful when some data might not be available yet
 */
export function calculateStreamAprWithDefaults({
  rewardAmount,
  rewardTokenDecimals = 18,
  rewardPriceInEth,
  durationInDays,
  poolTvlInEth,
  totalShares,
}: Partial<CalculateStreamAprParams> & {
  rewardAmount: string;
  durationInDays: number;
}): StreamAprResult {
  // Use fallback values if data is missing
  const fallbackTvl = poolTvlInEth || 10; // 10 ETH as reasonable default
  const fallbackPrice = rewardPriceInEth || 0.001; // Small default price

  return calculateStreamApr({
    rewardAmount,
    rewardTokenDecimals,
    rewardPriceInEth: fallbackPrice,
    durationInDays,
    poolTvlInEth: fallbackTvl,
    totalShares,
  });
}
