import { useMemo } from "react";
import { IncentiveStream } from "@/hooks/use-incentive-streams";

export interface StreamStatus {
  isActive: boolean;
  isIdle: boolean;
  isEnded: boolean;
  isExpired: boolean;
  timeRemaining: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
  progress: number;
  canStake: boolean;
  canHarvest: boolean;
  canUnstake: boolean;
  statusText: string;
  statusColor: string;
}

export function useStreamStatus(stream: IncentiveStream): StreamStatus {
  return useMemo(() => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const endTime = stream.endTime;
    const startTime = stream.startTime;
    const totalShares = stream.totalShares;

    // Calculate time remaining
    const remaining = endTime > now ? endTime - now : 0n;
    const timeRemaining = {
      days: Number(remaining / 86400n),
      hours: Number((remaining % 86400n) / 3600n),
      minutes: Number((remaining % 3600n) / 60n),
      seconds: Number(remaining % 60n),
    };

    // Calculate progress
    const totalDuration = endTime - startTime;
    const elapsed = now - startTime;
    let progress = 0;

    if (elapsed <= 0n) {
      progress = 0;
    } else if (elapsed >= totalDuration) {
      progress = 100;
    } else {
      progress = Number((elapsed * 100n) / totalDuration);
    }

    // Determine stream states
    const isEnded = now >= endTime;
    const isIdle = totalShares === 0n && !isEnded;
    const isActive = !isEnded && stream.status === "ACTIVE";
    const isExpired = isEnded && totalShares === 0n;

    // Determine what actions are possible
    const canStake = isActive && !isEnded;
    const canHarvest = !isEnded; // Can harvest as long as stream hasn't ended
    const canUnstake = true; // Can always unstake (emergency withdraw if needed)

    // Determine status text and color
    let statusText: string;
    let statusColor: string;

    if (isExpired) {
      statusText = "Expired";
      statusColor = "text-muted-foreground";
    } else if (isEnded) {
      statusText = "Ended";
      statusColor = "text-yellow-600 dark:text-yellow-400";
    } else if (isIdle) {
      statusText = "Idle (Extended)";
      statusColor = "text-blue-600 dark:text-blue-400";
    } else if (isActive) {
      statusText = "Active";
      statusColor = "text-green-600 dark:text-green-400";
    } else {
      statusText = "Inactive";
      statusColor = "text-muted-foreground";
    }

    return {
      isActive,
      isIdle,
      isEnded,
      isExpired,
      timeRemaining,
      progress,
      canStake,
      canHarvest,
      canUnstake,
      statusText,
      statusColor,
    };
  }, [stream]);
}

export function useStreamHealthCheck(stream: IncentiveStream) {
  const status = useStreamStatus(stream);

  return useMemo(() => {
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check for idle streams
    if (status.isIdle) {
      warnings.push("This stream is idle and duration has been extended");
      recommendations.push("Consider staking LP tokens to start earning rewards");
    }

    // Check for low liquidity
    if (stream.totalShares < BigInt(1e16)) {
      // Less than 0.01 LP tokens
      warnings.push("Low liquidity in this farm");
      recommendations.push("Higher liquidity provides more stable returns");
    }

    // Check for ending soon
    if (status.timeRemaining.days < 1 && !status.isEnded) {
      warnings.push("Stream ending soon");
      recommendations.push("Consider harvesting rewards before stream ends");
    }

    // Check for ended with remaining stake
    if (status.isEnded && stream.totalShares > 0n) {
      warnings.push("Stream has ended but LP tokens are still staked");
      recommendations.push("Unstake your LP tokens to stop the stream extension");
    }

    return {
      warnings,
      recommendations,
      healthScore: warnings.length === 0 ? 100 : Math.max(20, 100 - warnings.length * 25),
    };
  }, [stream, status]);
}
