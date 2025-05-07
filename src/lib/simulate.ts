import { Address, encodeFunctionData } from "viem";
import { simulateContract, estimateGas } from "@wagmi/core";
import { config } from "@/wagmi";

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
}
