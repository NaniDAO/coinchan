import { http, fallback } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";

// Configure RPC batching for better performance
const batchConfig = {
  // Wait up to 10ms to batch requests
  wait: 10,
  // Batch up to 100 requests together
  maxCount: 100,
  // Max size of batch in bytes (1MB)
  maxSize: 1_000_000,
};

export const config = getDefaultConfig({
  appName: "ZAMM",
  projectId: import.meta.env.VITE_WC_PROJECT_ID,
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: fallback(
      [
        http(import.meta.env.VITE_DRPC_1, {
          batch: batchConfig,
          retryCount: 1,
          retryDelay: 150,
          timeout: 6_000,
        }),
        http(import.meta.env.VITE_ALCHEMY_1, {
          batch: batchConfig,
          retryCount: 1,
          retryDelay: 150,
          timeout: 6_000,
        }),
        http("https://gateway.tenderly.co/public/mainnet", {
          timeout: 10_000,
        }),
        http("https://ethereum-rpc.publicnode.com", {
          timeout: 10_000,
        }),
      ],
      { rank: { interval: 60_000, sampleCount: 5, timeout: 2_000 } },
    ),
    [sepolia.id]: fallback(
      [
        http(import.meta.env.VITE_DRPC_SEPOLIA, {
          batch: batchConfig,
          retryCount: 1,
          retryDelay: 150,
          timeout: 6_000,
        }),
        http(import.meta.env.VITE_ALCHEMY_SEPOLIA, {
          batch: batchConfig,
          retryCount: 1,
          retryDelay: 150,
          timeout: 6_000,
        }),
        http("https://ethereum-sepolia-rpc.publicnode.com", {
          timeout: 10_000,
        }),
        http("https://sepolia.gateway.tenderly.co", {
          timeout: 10_000,
        }),
      ],
      { rank: { interval: 60_000, sampleCount: 5, timeout: 2_000 } },
    ),
  },
  // @TODO farcaster
  ssr: false,
  // Enable sync to support multiple chains
  syncConnectedChain: true,
  // Enable multiInjectedProviderDiscovery for better wallet detection
  multiInjectedProviderDiscovery: true,
});
