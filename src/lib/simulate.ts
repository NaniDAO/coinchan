import { Address } from "viem";
import { simulateContract } from "@wagmi/core";
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
