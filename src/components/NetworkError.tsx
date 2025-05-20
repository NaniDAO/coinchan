import { mainnet } from "viem/chains";
import { useChainId, useAccount } from "wagmi";

export const NetworkError = ({ message }: { message: string }) => {
  const { isConnected } = useAccount();
  const chainId = useChainId();

  if (isConnected && chainId !== mainnet.id) {
    return (
      <div className="text-xs mt-1 px-2 py-1 bg-secondary/70 border border-primary/30 rounded text-foreground">
        <strong>Wrong Network:</strong> Please switch to Ethereum mainnet in your wallet to {message}
      </div>
    );
  }

  return null;
};
