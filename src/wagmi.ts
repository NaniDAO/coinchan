import farcasterFrame from "@farcaster/frame-wagmi-connector";
import { injected, coinbaseWallet, metaMask } from "wagmi/connectors";
import { http, fallback, createConfig } from "wagmi";
import { mainnet } from "wagmi/chains";

export const config = createConfig({
  chains: [mainnet],
  connectors: [farcasterFrame(), injected(), coinbaseWallet(), metaMask()],
  transports: {
    [mainnet.id]: fallback([
      // Limit to just 2 reliable providers to reduce connection latency
      http(import.meta.env.VITE_DRPC_1),
      http("https://eth.llamarpc.com"),
    ]),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
