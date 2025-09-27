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

// Detect environment
const isProd = process.env.NODE_ENV === "production";
const isVercelPreview = process.env.VERCEL_ENV === "preview";

const chains = isProd && !isVercelPreview ? [mainnet] : [mainnet, sepolia];

export const config = getDefaultConfig({
  appName: "ZAMM",
  projectId: import.meta.env.VITE_WC_PROJECT_ID,
  // @ts-expect-error
  chains,
  transports: {
    [mainnet.id]: fallback([
      http(import.meta.env.VITE_DRPC_1, {
        batch: batchConfig,
        retryCount: 2,
        retryDelay: 200,
      }),
      http(import.meta.env.VITE_ALCHEMY_1, {
        batch: batchConfig,
        retryCount: 2,
        retryDelay: 200,
      }),
      http("https://cloudflare-eth.com"),
    ]),
    [sepolia.id]: fallback([
      http(import.meta.env.VITE_DRPC_SEPOLIA ?? "https://rpc.sepolia.org", {
        batch: batchConfig,
        retryCount: 2,
        retryDelay: 200,
      }),
      http(import.meta.env.VITE_ALCHEMY_SEPOLIA ?? "", {
        batch: batchConfig,
        retryCount: 2,
        retryDelay: 200,
      }),
    ]),
  },
  ssr: false,
  syncConnectedChain: false,
});
