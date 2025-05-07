import { useState, useEffect } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  usePublicClient,
  useSwitchChain,
  useChainId,
} from "wagmi";
import { formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { CoinchanAbi, CoinchanAddress } from "./constants/Coinchan";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { isUserRejectionError } from "./utils";

interface ClaimVestedProps {
  coinId: bigint;
}

export const ClaimVested = ({ coinId }: ClaimVestedProps) => {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  // State
  const [lockupInfo, setLockupInfo] = useState<{
    owner: string;
    creation: bigint;
    unlock: bigint;
    vesting: boolean;
    swapFee: bigint;
    claimed: bigint;
  } | null>(null);
  const [vestableAmount, setVestableAmount] = useState<bigint>(0n);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [txError, setTxError] = useState<string | null>(null);

  // Contract write state
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Fetch lockup information and vestable amount
  useEffect(() => {
    const fetchLockupInfo = async () => {
      if (!publicClient || !coinId) return;

      setIsLoading(true);
      setTxError(null);

      try {
        // Fetch lockup information
        const lockup = (await publicClient.readContract({
          address: CoinchanAddress,
          abi: CoinchanAbi,
          functionName: "lockups",
          args: [coinId],
        })) as any;

        // Check if we have valid lockup data
        if (!lockup || !Array.isArray(lockup) || lockup.length < 6) {
          setIsLoading(false);
          return;
        }

        // Parse the lockup info from the returned array
        // The struct fields are: owner, creation, unlock, vesting, swapFee, claimed
        const parsedLockup = {
          owner: lockup[0] as string,
          creation: BigInt(lockup[1]), // Ensure BigInt
          unlock: BigInt(lockup[2]), // Ensure BigInt
          vesting: Boolean(lockup[3]),
          swapFee: BigInt(lockup[4]), // Ensure BigInt
          claimed: BigInt(lockup[5]), // Ensure BigInt
        };

        // Verify we have a valid owner address
        if (!parsedLockup.owner || parsedLockup.owner === "0x0000000000000000000000000000000000000000") {
          setIsLoading(false);
          return;
        }

        setLockupInfo(parsedLockup);

        // Fetch vestable amount
        const vestable = (await publicClient.readContract({
          address: CoinchanAddress,
          abi: CoinchanAbi,
          functionName: "getVestableAmount",
          args: [coinId],
        })) as bigint;

        setVestableAmount(BigInt(vestable)); // Ensure BigInt
      } catch (err) {
        console.error("Error fetching lockup information:", err);
        setTxError("Failed to load lockup information");
      } finally {
        setIsLoading(false);
      }
    };

    fetchLockupInfo();
  }, [publicClient, coinId, address, isSuccess]);

  // Calculate vesting percentage
  const calculateVestingPercentage = (): number => {
    if (!lockupInfo) return 0;

    const totalDuration = Number(lockupInfo.unlock - lockupInfo.creation);
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const elapsed = Math.min(Number(currentTime - lockupInfo.creation), totalDuration);

    return (elapsed / totalDuration) * 100;
  };

  // Format time remaining until unlock
  const formatTimeRemaining = (): string => {
    if (!lockupInfo) return "";

    const now = BigInt(Math.floor(Date.now() / 1000));

    // If already unlocked
    if (now >= lockupInfo.unlock) {
      return "Fully unlocked";
    }

    // Ensure we're using proper BigInt conversion
    const secondsRemaining = Number(lockupInfo.unlock - now);
    const days = Math.floor(secondsRemaining / 86400);
    const hours = Math.floor((secondsRemaining % 86400) / 3600);
    const minutes = Math.floor((secondsRemaining % 3600) / 60);

    return `${days}d ${hours}h ${minutes}m remaining`;
  };

  // Handle claim vested tokens
  const handleClaimVested = async () => {
    if (!isConnected || !coinId) return;

    setTxError(null);

    try {
      // Switch to mainnet if needed
      if (chainId !== mainnet.id) {
        try {
          await switchChain({ chainId: mainnet.id });
        } catch (err) {
          // Only set error if it's not a user rejection
          if (!isUserRejectionError(err)) {
            console.error("Failed to switch to Ethereum mainnet:", err);
            setTxError("Failed to switch to Ethereum mainnet");
          }
          return;
        }
      }

      // Call the claimVested function
      const hash = await writeContractAsync({
        address: CoinchanAddress,
        abi: CoinchanAbi,
        functionName: "claimVested",
        args: [coinId],
        chainId: mainnet.id,
      });

      setTxHash(hash);
    } catch (err) {
      // Check for user rejection first
      if (isUserRejectionError(err)) {
        // Silent handling - don't show error for user rejections
        return;
      }

      // For contract errors, we still want to show specific messages
      if (err instanceof Error) {
        if (err.message.includes("Pending")) {
          setTxError("Tokens are not vestable yet");
        } else if (err.message.includes("NothingToVest")) {
          setTxError("No tokens available to vest");
        } else if (err.message.includes("Unauthorized")) {
          setTxError("Only the creator can claim vested tokens");
        } else {
          console.error("Error claiming vested tokens:", err);
          setTxError("Transaction failed. Please try again.");
        }
      } else {
        console.error("Unknown error during claim:", err);
        setTxError("Transaction failed. Please try again.");
      }
    }
  };

  // If loading or no coin ID, show loading state
  if (isLoading) {
    return (
      <Card className="w-full p-4 border border-yellow-200 shadow-sm rounded-lg">
        <CardContent className="p-2 flex justify-center items-center">
          <Loader2 className="h-5 w-5 animate-spin text-yellow-500" />
        </CardContent>
      </Card>
    );
  }

  // If no lockup exists or it's not a vesting lockup, don't show this component
  if (!lockupInfo || (!lockupInfo.vesting && BigInt(Math.floor(Date.now() / 1000)) < lockupInfo.unlock)) {
    return null;
  }

  return (
    <Card className="w-full p-4 border-2 border-yellow-200 shadow-md rounded-xl">
      <CardContent className="p-2">
        <h3 className="text-lg font-bold mb-2 text-yellow-800">Liquidity Vesting</h3>

        {/* Vesting progress */}
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span>Vesting Progress</span>
            <span>{calculateVestingPercentage().toFixed(2)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-yellow-500 h-2 rounded-full" style={{ width: `${calculateVestingPercentage()}%` }}></div>
          </div>
          <div className="mt-1 text-xs text-gray-600">{formatTimeRemaining()}</div>
        </div>

        {/* Vestable amount */}
        <div className="mb-4 p-2 bg-yellow-50 rounded-lg">
          <div className="flex justify-between">
            <span className="text-sm">Available to claim:</span>
            <span className="font-bold">{formatUnits(vestableAmount, 18)} LP</span>
          </div>
          {lockupInfo.claimed > 0n && (
            <div className="flex justify-between mt-1 text-xs text-gray-600">
              <span>Already claimed:</span>
              <span>{formatUnits(lockupInfo.claimed, 18)} LP</span>
            </div>
          )}
        </div>

        {/* Claim button */}
        <Button
          onClick={handleClaimVested}
          disabled={!isConnected || vestableAmount === 0n || isPending}
          className="w-full bg-yellow-500 hover:bg-yellow-600"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Claiming...
            </span>
          ) : (
            "Claim Vested LP Tokens"
          )}
        </Button>

        {/* Error message */}
        {txError && <div className="mt-2 text-xs text-red-600">{txError}</div>}

        {/* Success message */}
        {isSuccess && <div className="mt-2 text-xs text-green-600">Successfully claimed tokens!</div>}
      </CardContent>
    </Card>
  );
};

export default ClaimVested;
