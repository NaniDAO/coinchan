import { config } from "@/wagmi";
import { estimateGas, simulateContract } from "@wagmi/core";
import { type Address, encodeFunctionData } from "viem";

/**
 * Helper function to simulate a contract interaction
 * @param abi The contract ABI
 * @param address The contract address
 * @param functionName The function name to call
 * @param args The arguments to pass to the function
 * @returns A promise that resolves to the simulation result
 */
export async function simulateContractInteraction({
  abi,
  address,
  functionName,
  args,
  value = 0n,
}: {
  abi: any;
  address: Address;
  functionName: string;
  args: any;
  value?: bigint;
}): Promise<any> {
  try {
    // Check if wallet is properly connected and initialized
    if (!config || !config.state || !config.state.connections || config.state.connections.size === 0) {
      // Wait briefly to allow wallet connection to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // If still not connected, throw a more informative error
      if (!config || !config.state || !config.state.connections || config.state.connections.size === 0) {
        throw new Error("Wallet connection not initialized. Please refresh and try again.");
      }
    }

    return simulateContract(config, {
      // @ts-ignore
      abi,
      // @ts-ignore
      address,
      // @ts-ignore
      functionName,
      // @ts-ignore
      args,
      value,
    });
  } catch (error) {
    // If the error is about getChainId, it's likely a wallet connection issue
    if (error instanceof Error && error.message.includes("getChainId")) {
      throw new Error("Wallet connection not ready. Please refresh the page and try again.");
    }
    throw error;
  }
}

/**
 * Helper function to estimate gas for a contract interaction
 * @param abi The contract ABI
 * @param address The contract address
 * @param functionName The function name to call
 * @param args The arguments to pass to the function
 * @returns A promise that resolves to the gas estimate
 */
export async function estimateContractGas({
  abi,
  address,
  functionName,
  args,
  value = 0n,
}: {
  abi: any;
  address: Address;
  functionName: string;
  args: any;
  value?: bigint;
}): Promise<bigint> {
  try {
    // Check if wallet is properly connected and initialized
    if (!config || !config.state || !config.state.connections || config.state.connections.size === 0) {
      // Wait briefly to allow wallet connection to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // If still not connected, throw a more informative error
      if (!config || !config.state || !config.state.connections || config.state.connections.size === 0) {
        throw new Error("Wallet connection not initialized. Please refresh and try again.");
      }
    }

    const data = encodeFunctionData({
      abi,
      functionName,
      args,
    });

    return estimateGas(config, {
      to: address,
      data,
      value,
    });
  } catch (error) {
    // If the error is about getChainId, it's likely a wallet connection issue
    if (error instanceof Error && error.message.includes("getChainId")) {
      throw new Error("Wallet connection not ready. Please refresh the page and try again.");
    }

    // Fallback to a safe gas estimate if estimation fails but the basic connection is working
    if (config && config.state && config.state.connections && config.state.connections.size > 0) {
      // Return a conservative gas estimate (500,000 gas units) - this is high but better than failing
      return 500000n;
    }

    throw error;
  }
}
