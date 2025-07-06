import { useCallback } from "react";
import { IncentiveStream } from "@/hooks/use-incentive-streams";

export interface StreamValidation {
  isActive: boolean;
  isExpired: boolean;
  isIdle: boolean;
  timeUntilExpiry: number;
  canStake: boolean;
  canUnstake: boolean;
  canHarvest: boolean;
  warningMessage?: string;
  errorMessage?: string;
}

export function useStreamValidation() {
  const validateStream = useCallback((stream: IncentiveStream): StreamValidation => {
    const now = Math.floor(Date.now() / 1000);
    const currentTimeBigInt = BigInt(now);
    const timeUntilExpiry = Number(stream.endTime) - now;

    const isExpired = currentTimeBigInt >= stream.endTime;
    const isActive = stream.status === "ACTIVE" && !isExpired;
    const isIdle = stream.totalShares === 0n;

    // Stream expires in less than 10 minutes
    const isExpiringSoon = timeUntilExpiry > 0 && timeUntilExpiry < 600;

    // Stream expires in less than 1 minute
    const isExpiringVerySoon = timeUntilExpiry > 0 && timeUntilExpiry < 60;

    let warningMessage: string | undefined;
    let errorMessage: string | undefined;

    if (isExpired) {
      errorMessage = "This stream has expired and no longer accepts new stakes";
    } else if (isExpiringVerySoon) {
      errorMessage = "This stream expires in less than 1 minute";
    } else if (isExpiringSoon) {
      warningMessage = `This stream expires in ${Math.floor(timeUntilExpiry / 60)} minutes`;
    } else if (isIdle) {
      warningMessage = "This stream has no active stakers";
    }

    return {
      isActive,
      isExpired,
      isIdle,
      timeUntilExpiry,
      canStake: isActive && !isExpiringVerySoon,
      canUnstake: true, // Can always unstake
      canHarvest: true, // Can always harvest pending rewards
      warningMessage,
      errorMessage,
    };
  }, []);

  const validateStreamBeforeAction = useCallback(
    (
      stream: IncentiveStream,
      action: "stake" | "unstake" | "harvest",
    ): {
      canProceed: boolean;
      warning?: string;
      error?: string;
    } => {
      const validation = validateStream(stream);

      switch (action) {
        case "stake":
          if (!validation.canStake) {
            return {
              canProceed: false,
              error: validation.errorMessage || "Cannot stake in this stream",
            };
          }
          return {
            canProceed: true,
            warning: validation.warningMessage,
          };

        case "unstake":
          if (!validation.canUnstake) {
            return {
              canProceed: false,
              error: "Cannot unstake from this stream",
            };
          }
          return {
            canProceed: true,
            warning: validation.warningMessage,
          };

        case "harvest":
          if (!validation.canHarvest) {
            return {
              canProceed: false,
              error: "Cannot harvest from this stream",
            };
          }
          return {
            canProceed: true,
            warning: validation.warningMessage,
          };

        default:
          return {
            canProceed: false,
            error: "Unknown action",
          };
      }
    },
    [validateStream],
  );

  return {
    validateStream,
    validateStreamBeforeAction,
  };
}
