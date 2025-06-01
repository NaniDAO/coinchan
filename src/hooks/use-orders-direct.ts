import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { mainnet } from "viem/chains";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { parseAbiItem, decodeFunctionData } from "viem";

export interface DirectOrder {
  id: string;
  maker: string;
  tokenIn: string;
  idIn: string;
  amtIn: string;
  tokenOut: string;
  idOut: string;
  amtOut: string;
  deadline: string;
  partialFill: boolean;
  inDone: string;
  outDone: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
  txHash: string;
  blockNumber: string;
}

// Event signatures for filtering logs
const MAKE_EVENT = parseAbiItem("event Make(address indexed maker, bytes32 indexed orderHash)");
const FILL_EVENT = parseAbiItem("event Fill(address indexed taker, bytes32 indexed orderHash)");
const CANCEL_EVENT = parseAbiItem("event Cancel(address indexed maker, bytes32 indexed orderHash)");

/**
 * Temporary hook to fetch orders directly from blockchain events
 * This is a workaround until the orderbook indexer is deployed
 */
export function useOrdersDirect() {
  const publicClient = usePublicClient({ chainId: mainnet.id });

  return useQuery({
    queryKey: ["orders-direct"],
    queryFn: async () => {
      if (!publicClient) throw new Error("Public client not available");

      try {
        // Get recent blocks (last ~1000 blocks = ~3.5 hours)
        const latestBlock = await publicClient.getBlockNumber();
        const fromBlock = latestBlock - 1000n;

        console.log(`Fetching orders from blocks ${fromBlock} to ${latestBlock}`);

        // Fetch Make events (order creation)
        const makeLogs = await publicClient.getLogs({
          address: CookbookAddress,
          event: MAKE_EVENT,
          fromBlock,
          toBlock: latestBlock,
        });

        console.log(`Found ${makeLogs.length} Make events`);

        // Fetch Fill events  
        const fillLogs = await publicClient.getLogs({
          address: CookbookAddress,
          event: FILL_EVENT,
          fromBlock,
          toBlock: latestBlock,
        });

        console.log(`Found ${fillLogs.length} Fill events`);

        // Fetch Cancel events
        const cancelLogs = await publicClient.getLogs({
          address: CookbookAddress,
          event: CANCEL_EVENT,
          fromBlock,
          toBlock: latestBlock,
        });

        console.log(`Found ${cancelLogs.length} Cancel events`);

        // Process Make events to get order details
        const orders: DirectOrder[] = [];

        for (const makeLog of makeLogs) {
          try {
            const { args } = makeLog;
            const { maker, orderHash } = args;

            // Get the transaction to decode the makeOrder call
            const tx = await publicClient.getTransaction({
              hash: makeLog.transactionHash!,
            });

            // Decode the transaction input
            const decoded = decodeFunctionData({
              abi: CookbookAbi,
              data: tx.input,
            });

            if (decoded.functionName === "makeOrder") {
              const [tokenIn, idIn, amtIn, tokenOut, idOut, amtOut, deadline, partialFill] = decoded.args;

              // Check if this order was filled or cancelled
              const fillsForOrder = fillLogs.filter(log => log.args.orderHash === orderHash);
              const cancelsForOrder = cancelLogs.filter(log => log.args.orderHash === orderHash);

              let status: "ACTIVE" | "COMPLETED" | "CANCELLED" = "ACTIVE";
              let inDone = "0";
              let outDone = "0";

              if (cancelsForOrder.length > 0) {
                status = "CANCELLED";
              } else if (fillsForOrder.length > 0) {
                // Calculate fill progress - simplified for now
                // In reality, need to process all fills and calculate cumulative amounts
                status = "COMPLETED"; // Assume completed for now
                inDone = amtIn.toString();
                outDone = amtOut.toString();
              }

              const createdAt = new Date(makeLog.blockNumber ? Number(makeLog.blockNumber) * 13000 : Date.now()).toISOString();
              
              const order: DirectOrder = {
                id: orderHash as string,
                maker: maker as string,
                tokenIn,
                idIn: idIn.toString(),
                amtIn: amtIn.toString(),
                tokenOut,
                idOut: idOut.toString(),
                amtOut: amtOut.toString(),
                deadline: new Date(Number(deadline) * 1000).toISOString(),
                partialFill,
                inDone,
                outDone,
                status,
                createdAt,
                updatedAt: createdAt,
                txHash: makeLog.transactionHash || "0x",
                blockNumber: makeLog.blockNumber?.toString() || "0",
              };

              orders.push(order);
            }
          } catch (error) {
            console.error("Error processing Make event:", error);
            continue;
          }
        }

        console.log(`Processed ${orders.length} orders`);
        return orders;

      } catch (error) {
        console.error("Error fetching orders directly:", error);
        throw error;
      }
    },
    enabled: !!publicClient,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Refetch every minute
  });
}