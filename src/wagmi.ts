import { http, fallback } from "wagmi";
import { mainnet } from "wagmi/chains";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";

export const config = getDefaultConfig({
  appName: "ZAMM",
  projectId: import.meta.env.VITE_WC_PROJECT_ID,
  chains: [mainnet],
  transports: {
    [mainnet.id]: fallback([
      http(import.meta.env.VITE_DRPC_1),
      http("https://cloudflare-eth.com"),
    ]),
  },
  // @TODO farcaster
  ssr: false,
});
