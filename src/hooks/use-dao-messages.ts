import { useReadContract } from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI } from "@/constants/ZORG";

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
 * Helper to parse proposal message data (tagged JSON format from majeur.html)
 */
export function parseProposalMessage(messageText: string): {
  op: number;
  to: string;
  value: string;
  data: string;
  nonce: string;
  description: string;
} | null {
  try {
    // Format from majeur.html: [TAG:PROPOSAL] JSON
    if (!messageText.includes("[TAG:PROPOSAL]")) {
      return null;
    }

    const jsonStart = messageText.indexOf("{");
    if (jsonStart === -1) return null;

    const jsonData = JSON.parse(messageText.substring(jsonStart));

    return {
      op: jsonData.op || 0,
      to: jsonData.to || "",
      value: jsonData.value || "0",
      data: jsonData.data || "0x",
      nonce: jsonData.nonce || "0x0000000000000000000000000000000000000000000000000000000000000000",
      description: jsonData.description || "",
    };
  } catch (e) {
    console.error("Failed to parse proposal message:", e);
    return null;
  }
}
