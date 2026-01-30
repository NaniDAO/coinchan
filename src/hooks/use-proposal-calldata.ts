import { ZORG_ABI, ZORG_ADDRESS } from "@/constants/ZORG";
import { useMemo } from "react";
import { encodeAbiParameters, getAddress, keccak256, parseAbiParameters } from "viem";
import { useReadContract, useReadContracts } from "wagmi";

// Type for parsed proposal data from chat messages
interface ParsedProposalData {
  type: string;
  op: number;
  to: `0x${string}`;
  value: string;
  data: `0x${string}`;
  nonce: `0x${string}`;
  description?: string;
}

// Decode proposal data from tagged message format
// Format: <<<PROPOSAL_DATA {JSON} PROPOSAL_DATA>>>
// Uses flexible whitespace matching to handle various formatting
function decodeProposalMessage(messageText: string): ParsedProposalData | null {
  // Match with flexible whitespace (like DAOChat.tsx does)
  const match = messageText.match(/<<<PROPOSAL_DATA\s*(\{[\s\S]*?\})\s*PROPOSAL_DATA>>>/);
  if (!match) {
    // Check if there's partial PROPOSAL_DATA to debug
    if (messageText.includes("PROPOSAL_DATA")) {
      console.log(
        "[decodeProposalMessage] Message contains PROPOSAL_DATA but regex didn't match:",
        messageText.slice(0, 200),
      );
    }
    return null;
  }

  try {
    const decoded = JSON.parse(match[1]);
    if (decoded.type === "PROPOSAL") {
      // Validate required fields exist and have correct format
      if (
        typeof decoded.op !== "number" ||
        typeof decoded.to !== "string" ||
        typeof decoded.value !== "string" ||
        typeof decoded.data !== "string" ||
        typeof decoded.nonce !== "string"
      ) {
        console.error("Invalid proposal data structure:", decoded);
        return null;
      }
      // Validate addresses start with 0x
      if (!decoded.to.startsWith("0x") || !decoded.data.startsWith("0x") || !decoded.nonce.startsWith("0x")) {
        console.error("Invalid hex format in proposal data:", decoded);
        return null;
      }
      return decoded as ParsedProposalData;
    }
  } catch (e) {
    console.error("Failed to decode proposal message:", e, match[1]);
  }

  return null;
}

// Pad a hex string to bytes32 (66 chars including 0x prefix)
function padToBytes32(hex: string): `0x${string}` {
  const cleaned = hex.toLowerCase().replace(/^0x/, "");
  const padded = cleaned.padStart(64, "0");
  return `0x${padded}` as `0x${string}`;
}

// Compute proposal ID matching the Solidity implementation
// This matches Moloch.sol's proposal ID computation
function computeProposalId(
  daoAddress: `0x${string}`,
  op: number,
  to: `0x${string}`,
  value: bigint,
  data: `0x${string}`,
  nonce: `0x${string}`,
  config: bigint,
): bigint {
  // Normalize addresses using viem's getAddress for proper checksumming
  // viem requires either lowercase or properly checksummed addresses
  const normalizedDaoAddress = getAddress(daoAddress);
  const normalizedTo = getAddress(to);
  // Data is bytes (variable length), normalize to lowercase
  const normalizedData = data.toLowerCase() as `0x${string}`;
  // Nonce must be exactly bytes32 (64 hex chars), pad if needed
  const normalizedNonce = padToBytes32(nonce);

  // Hash the calldata
  const dataHash = keccak256(normalizedData);

  console.log("[computeProposalId] Inputs:", {
    daoAddress: normalizedDaoAddress,
    op,
    to: normalizedTo,
    value: value.toString(),
    dataHash,
    nonce: normalizedNonce,
    config: config.toString(),
  });

  // Encode all parameters in the same order as Solidity
  const encoded = encodeAbiParameters(
    parseAbiParameters("address, uint8, address, uint256, bytes32, bytes32, uint256"),
    [normalizedDaoAddress, op, normalizedTo, value, dataHash, normalizedNonce, config],
  );

  // Return the keccak256 hash as BigInt
  return BigInt(keccak256(encoded));
}

/**
 * Hook to fetch the DAO config value
 */
export const useDAOConfig = () => {
  const { data, isLoading } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "config",
    query: {
      staleTime: 60_000, // 1 minute (config rarely changes)
    },
  });

  return {
    config: data as bigint | undefined,
    isLoading,
  };
};

/**
 * Hook to fetch all DAO messages
 */
export const useAllDAOMessages = () => {
  // First get the message count
  const { data: messageCount, isLoading: countLoading } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "getMessageCount",
    query: {
      staleTime: 30_000, // 30 seconds
    },
  });

  const count = messageCount ? Number(messageCount) : 0;

  // Create contract calls for all messages
  const contracts = useMemo(() => {
    if (count === 0) return [];
    return Array.from({ length: count }, (_, i) => ({
      address: ZORG_ADDRESS as `0x${string}`,
      abi: ZORG_ABI,
      functionName: "messages" as const,
      args: [BigInt(i)] as const,
    }));
  }, [count]);

  const { data: messagesData, isLoading: messagesLoading } = useReadContracts({
    contracts,
    query: {
      enabled: count > 0,
      staleTime: 60_000, // 1 minute
    },
  });

  const messages = useMemo(() => {
    if (!messagesData) return [];
    const msgs = messagesData
      .map((result) => (result.status === "success" ? (result.result as string) : null))
      .filter((msg): msg is string => msg !== null);

    console.log("[useAllDAOMessages] Fetched messages:", {
      count,
      fetchedCount: msgs.length,
      hasProposalData: msgs.some((m) => m.includes("PROPOSAL_DATA")),
      sampleMessages: msgs.slice(0, 3).map((m) => m.slice(0, 100)),
    });

    return msgs;
  }, [messagesData, count]);

  return {
    messages,
    isLoading: countLoading || messagesLoading,
    count,
  };
};

/**
 * Hook to find and match proposal calldata from chat messages
 * Returns the parsed proposal data if found
 */
export const useProposalCalldata = ({ proposalId }: { proposalId?: bigint }) => {
  const { config, isLoading: configLoading } = useDAOConfig();
  const { messages, isLoading: messagesLoading } = useAllDAOMessages();

  const result = useMemo(() => {
    if (!proposalId || config === undefined || messages.length === 0) {
      console.log("[useProposalCalldata] Early return:", {
        hasProposalId: !!proposalId,
        hasConfig: config !== undefined,
        messageCount: messages.length,
      });
      return {
        proposalData: undefined,
        isVerified: false,
      };
    }

    console.log("[useProposalCalldata] Processing:", {
      proposalId: proposalId.toString(),
      config: config.toString(),
      messageCount: messages.length,
    });

    // Search through messages for matching proposal
    for (const msg of messages) {
      const propData = decodeProposalMessage(msg);
      if (propData) {
        console.log("[useProposalCalldata] Found PROPOSAL_DATA:", propData);
        try {
          // Recompute the proposal ID from the tagged data
          const recomputedId = computeProposalId(
            ZORG_ADDRESS,
            propData.op,
            propData.to as `0x${string}`,
            BigInt(propData.value),
            propData.data as `0x${string}`,
            propData.nonce as `0x${string}`,
            config,
          );

          console.log("[useProposalCalldata] ID comparison:", {
            recomputedId: recomputedId.toString(),
            proposalId: proposalId.toString(),
            match: recomputedId.toString() === proposalId.toString(),
          });

          // Check if it matches this proposal's ID
          if (recomputedId.toString() === proposalId.toString()) {
            return {
              proposalData: propData,
              isVerified: true,
            };
          }
        } catch (e) {
          console.error("Error verifying proposal:", e);
        }
      }
    }

    return {
      proposalData: undefined,
      isVerified: false,
    };
  }, [proposalId, config, messages]);

  return {
    ...result,
    isLoading: configLoading || messagesLoading,
    hasMessages: messages.length > 0,
  };
};
