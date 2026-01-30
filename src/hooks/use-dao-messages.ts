import { useReadContract } from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI, ZORG_RENDERER, ZORG_RENDERER_ABI } from "@/constants/ZORG";
import { useMemo } from "react";

/**
 * Hook to fetch total message count
 */
export const useDAOMessageCount = () => {
  const { data, isLoading } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "getMessageCount",
    query: {
      staleTime: 10_000, // 10 seconds
    },
  });

  return {
    count: data ? Number(data) : 0,
    isLoading,
  };
};

/**
 * Hook to fetch a specific message by index
 */
export const useDAOMessage = ({ index }: { index?: number }) => {
  const { data, isLoading } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "messages",
    args: index !== undefined ? [BigInt(index)] : undefined,
    query: {
      enabled: index !== undefined,
      staleTime: 60_000, // 1 minute (messages don't change)
    },
  });

  return {
    message: data as string | undefined,
    isLoading,
  };
};

/**
 * Hook to fetch proposal metadata from the renderer
 * Uses ZORG_RENDERER.daoTokenURI to get encoded JSON with description and image
 */
export const useProposalDescription = ({
  proposalId,
}: {
  proposalId?: bigint;
}) => {
  const { data: tokenURI, isLoading } = useReadContract({
    address: ZORG_RENDERER,
    abi: ZORG_RENDERER_ABI,
    functionName: "daoTokenURI",
    args: proposalId ? [ZORG_ADDRESS, proposalId] : undefined,
    query: {
      enabled: !!proposalId,
      staleTime: 60_000, // 1 minute (proposal metadata doesn't change)
    },
  });

  const result = useMemo(() => {
    if (!tokenURI) {
      return {
        description: undefined,
        image: undefined,
        name: undefined,
        parsedAction: undefined,
      };
    }

    try {
      // Format: data:application/json;base64,<base64data>
      const base64Data = tokenURI.replace("data:application/json;base64,", "");
      const jsonString = atob(base64Data);
      const metadata = JSON.parse(jsonString);

      // Try to parse action details from description
      // Format might be: "Send X ETH to 0x..." or "Call 0x... with data 0x..."
      const description = metadata.description as string | undefined;
      let parsedAction:
        | {
            type: "eth_transfer" | "contract_call" | "unknown";
            to?: string;
            value?: string;
            calldata?: string;
          }
        | undefined;

      if (description) {
        // Check for ETH transfer pattern
        const ethTransferMatch = description.match(/send\s+([\d.]+)\s*eth\s+to\s+(0x[a-fA-F0-9]{40})/i);
        if (ethTransferMatch) {
          parsedAction = {
            type: "eth_transfer",
            value: ethTransferMatch[1],
            to: ethTransferMatch[2],
          };
        }

        // Check for contract call with calldata
        const calldataMatch = description.match(/calldata[:\s]*(0x[a-fA-F0-9]+)/i);
        const targetMatch = description.match(/(?:to|target|call)\s*(0x[a-fA-F0-9]{40})/i);

        if (calldataMatch) {
          parsedAction = {
            type: "contract_call",
            to: targetMatch?.[1],
            calldata: calldataMatch[1],
          };
        }

        // Check for hex data in description that looks like calldata
        if (!parsedAction) {
          const hexMatch = description.match(/(0x[a-fA-F0-9]{8,})/);
          if (hexMatch && hexMatch[1].length > 10) {
            parsedAction = {
              type: "contract_call",
              to: targetMatch?.[1],
              calldata: hexMatch[1],
            };
          }
        }
      }

      return {
        description: metadata.description as string | undefined,
        image: metadata.image as string | undefined,
        name: metadata.name as string | undefined,
        parsedAction,
      };
    } catch (e) {
      console.error("Failed to decode proposal metadata:", e);
      return {
        description: undefined,
        image: undefined,
        name: undefined,
        parsedAction: undefined,
      };
    }
  }, [tokenURI]);

  return {
    ...result,
    isLoading,
  };
};
