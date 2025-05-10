import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";

import App from "./App.tsx";
import { config } from "./wagmi.ts";

import "./index.css";

// Configure query client with performance optimizations
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reduce the frequency of background refetches
      staleTime: 30000, // 30 seconds
      refetchInterval: false,
      refetchOnWindowFocus: false,
      // Retry less aggressively
      retry: 1,
      // Set a reasonable timeout
      networkMode: "online",
    },
  },
});

// Only use StrictMode in development to avoid double mounting
const AppRoot = import.meta.env.DEV ? (
  <React.StrictMode>
    <WagmiProvider config={config} reconnectOnMount={true}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
) : (
  <WagmiProvider config={config} reconnectOnMount={true}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </WagmiProvider>
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(AppRoot);
