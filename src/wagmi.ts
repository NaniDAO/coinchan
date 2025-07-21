import { http, fallback } from "wagmi";
import { mainnet } from "wagmi/chains";

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
  chains: [mainnet],
  transports: {
    [mainnet.id]: fallback([
      // Primary RPC with batching enabled
      http(import.meta.env.VITE_DRPC_1, {
        batch: batchConfig,
        retryCount: 2,
        retryDelay: 200,
      }),
      // Alchemy fallback with batching
      http(import.meta.env.VITE_ALCHEMY_1, {
        batch: batchConfig,
        retryCount: 2,
        retryDelay: 200,
      }),
      // Cloudflare as last resort fallback (no batching)
      http("https://cloudflare-eth.com"),
    ]),
  },
  // @TODO farcaster
  ssr: false,
  // Disable sync since we only support mainnet
  syncConnectedChain: false,
});
