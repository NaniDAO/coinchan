import farcasterFrame from "@farcaster/frame-wagmi-connector";
import { injected, coinbaseWallet, metaMask } from "wagmi/connectors";
import { http, fallback, createConfig } from "wagmi";
import { mainnet } from "wagmi/chains";

export const config = createConfig({
  chains: [mainnet],
  connectors: [farcasterFrame(), injected(), coinbaseWallet(), metaMask()],
  transports: {
    [mainnet.id]: fallback([
      http(import.meta.env.VITE_DRPC_1),
      http("https://rpc.ankr.com/eth"),
      http("https://eth.llamarpc.com"),
      http("https://ethereum.publicnode.com"),
      http("https://cloudflare-eth.com"),
      http(),
    ]),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
