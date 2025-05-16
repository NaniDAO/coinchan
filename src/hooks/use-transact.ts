import { useEffect, useState } from "react";
import { Address, Hex } from "viem";
import {
  useAccount,
  useCapabilities,
  useChainId,
  useWalletClient,
} from "wagmi";

interface Op {
  to: Address;
  value: bigint;
  data: Hex;
}

export const useOps = ({ ops }: { ops: Op[] }) => {
  const { address } = useAccount();
  const chainId = useChainId();
  const { data: availableCapabilities } = useCapabilities({
    account: address,
    chainId: chainId,
  });
  const [isBatchingSupported, setIsBatchingSupported] = useState(false);
  const { data: walletClient } = useWalletClient({
    account: address,
    chainId,
  });

  useEffect(() => {
    if (availableCapabilities) {
      if (availableCapabilities.atomicBatch.supported) {
        setIsBatchingSupported(true);
      }
    }
  }, [availableCapabilities]);

  const execute = async () => {
    let data;
    if (isBatchingSupported) {
      // Execute batch transaction
      const { id } = await walletClient!.sendCalls({
        calls: ops.map((op) => ({
          to: op.to,
          value: op.value,
          data: op.data,
        })),
      });

      data = {
        type: "7702",
        result: id,
      };
    } else {
      // Execute individual transactions
      let hashes = "";

      for (const op of ops) {
        const txHash = await walletClient!.sendTransaction({
          to: op.to,
          value: op.value,
          data: op.data,
        });

        if (hashes) {
          hashes += ";" + txHash;
        } else {
          hashes = txHash;
        }
      }

      data = {
        type: "1559",
        result: hashes,
      };
    }

    return data;
  };

  return {
    execute,
  };
};
