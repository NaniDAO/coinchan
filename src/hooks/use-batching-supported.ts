import { useMemo } from "react";
import { mainnet } from "viem/chains";
import { useAccount, useCapabilities } from "wagmi";

export const useBatchingSupported = () => {
  const { address } = useAccount();
  const { data: availableCapabilities } = useCapabilities({
    account: address,
    chainId: mainnet.id,
  });

  const isBatchingSupported = useMemo(() => {
    // The availableCapabilities data structure is { [chainId: number]: Capabilities }.
    // We need to check if *any* of the capability objects within this map
    // indicate support for the 'atomic' capability.
    // The error message indicates 'atomicBatch' is incorrect and 'atomic'
    // with a 'status' property is the correct structure.
    console.log("Available Capabilities:", availableCapabilities);
    if (availableCapabilities) {
      if (availableCapabilities.atomic) {
        if (availableCapabilities.atomic.status === "ready") {
          return true;
        }
      }
    }

    return false;
  }, [availableCapabilities]);

  return isBatchingSupported;
};
