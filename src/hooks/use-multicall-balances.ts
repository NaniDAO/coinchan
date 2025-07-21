import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { type Address, encodeFunctionData, decodeFunctionResult } from "viem";
import { mainnet } from "viem/chains";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { MulticallAbi, MulticallAddress } from "@/constants/Multicall";
import { type TokenMeta, USDT_ADDRESS, CULT_ADDRESS } from "@/lib/coins";
import { isCookbookCoin } from "@/lib/coin-utils";

interface BalanceCall {
  target: Address;
  callData: `0x${string}`;
  tokenId: bigint | null;
  isEth?: boolean;
  isSpecialToken?: boolean;
  specialAddress?: Address;
}

/**
 * Optimized hook to fetch all token balances using multicall
 * This reduces individual balance calls from O(n) to O(1)
 */
export function useMulticallBalances(tokens: TokenMeta[]) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: mainnet.id });

  return useQuery({
    queryKey: ["multicall-balances", address, tokens.map((t) => t.id).join(",")],
    queryFn: async () => {
      if (!publicClient || !address || tokens.length === 0) {
        return tokens.map((token) => ({ ...token, balance: 0n }));
      }

      // Prepare multicall data
      const calls: BalanceCall[] = [];
      const tokenMapping: Record<number, TokenMeta> = {};

      tokens.forEach((token, index) => {
        tokenMapping[index] = token;

        // Handle ETH balance separately
        if (token.id === null) {
          calls.push({
            target: address,
            callData: "0x", // ETH balance call will be handled separately
            tokenId: null,
            isEth: true,
          });
          return;
        }

        // Handle special tokens (USDT, CULT) - check by symbol instead of address
        if (token.symbol === "USDT" || token.symbol === "CULT") {
          const specialAddress = token.symbol === "USDT" ? USDT_ADDRESS : CULT_ADDRESS;
          calls.push({
            target: specialAddress,
            callData: encodeFunctionData({
              abi: [
                {
                  inputs: [{ internalType: "address", name: "account", type: "address" }],
                  name: "balanceOf",
                  outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
                  stateMutability: "view",
                  type: "function",
                },
              ],
              functionName: "balanceOf",
              args: [address],
            }),
            tokenId: token.id,
            isSpecialToken: true,
            specialAddress,
          });
          return;
        }

        // Handle regular tokens
        const isBookCoin = isCookbookCoin(token.id);
        const contractAddress = isBookCoin ? CookbookAddress : CoinsAddress;
        const contractAbi = isBookCoin ? CookbookAbi : CoinsAbi;

        calls.push({
          target: contractAddress,
          callData: encodeFunctionData({
            abi: contractAbi,
            functionName: "balanceOf",
            args: [address, token.id],
          }),
          tokenId: token.id,
        });
      });

      // Execute multicall for non-ETH tokens
      const nonEthCalls = calls.filter((call) => !call.isEth);
      const multicallResults: bigint[] = [];

      if (nonEthCalls.length > 0) {
        try {
          const multicallData = nonEthCalls.map((call) => ({
            target: call.target,
            callData: call.callData,
          }));

          const results = (await publicClient.readContract({
            address: MulticallAddress,
            abi: MulticallAbi,
            functionName: "aggregate3",
            args: [
              multicallData.map((call) => ({
                target: call.target,
                allowFailure: true,
                callData: call.callData,
              })),
            ],
          })) as { success: boolean; returnData: `0x${string}` }[];

          results.forEach((result, index) => {
            if (result.success && result.returnData !== "0x") {
              try {
                const call = nonEthCalls[index];
                let decoded: bigint;

                if (call.isSpecialToken) {
                  // Decode special token balance
                  decoded = decodeFunctionResult({
                    abi: [
                      {
                        inputs: [{ internalType: "address", name: "account", type: "address" }],
                        name: "balanceOf",
                        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
                        stateMutability: "view",
                        type: "function",
                      },
                    ],
                    functionName: "balanceOf",
                    data: result.returnData,
                  }) as bigint;
                } else {
                  // Decode regular token balance
                  const tokenId = nonEthCalls[index].tokenId;
                  const isBookCoin = tokenId !== null && tokenId !== undefined ? isCookbookCoin(tokenId) : false;
                  const contractAbi = isBookCoin ? CookbookAbi : CoinsAbi;

                  decoded = decodeFunctionResult({
                    abi: contractAbi,
                    functionName: "balanceOf",
                    data: result.returnData,
                  }) as bigint;
                }

                multicallResults.push(decoded);
              } catch (error) {
                console.warn(`Failed to decode balance for token ${nonEthCalls[index].tokenId}:`, error);
                multicallResults.push(0n);
              }
            } else {
              multicallResults.push(0n);
            }
          });
        } catch (error) {
          console.error("Multicall failed:", error);
          // Fallback to zeros if multicall fails
          multicallResults.push(...new Array(nonEthCalls.length).fill(0n));
        }
      }

      // Handle ETH balance separately
      let ethBalance = 0n;
      const hasEthToken = calls.some((call) => call.isEth);
      if (hasEthToken) {
        try {
          ethBalance = await publicClient.getBalance({ address });
        } catch (error) {
          console.error("Failed to fetch ETH balance:", error);
        }
      }

      // Combine results with tokens
      const tokensWithBalances: TokenMeta[] = [];
      let multicallIndex = 0;

      tokens.forEach((token) => {
        let balance = 0n;

        if (token.id === null) {
          // ETH token
          balance = ethBalance;
        } else {
          // Other tokens from multicall
          balance = multicallResults[multicallIndex] || 0n;
          multicallIndex++;
        }

        tokensWithBalances.push({
          ...token,
          balance,
        });
      });

      return tokensWithBalances;
    },
    enabled: !!publicClient && !!address && tokens.length > 0,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Refetch every minute
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
