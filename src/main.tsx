import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { RouterProvider, createRouter } from "@tanstack/react-router";

import { config } from "./wagmi.ts";
import { routeTree } from "./routeTree.gen";
import { ThemeProvider } from "./lib/theme";

import "./index.css";
import "./i18n";

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

// Create a new router instance
const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Application with all providers
const AppWithProviders = () => (
  <ThemeProvider>
    <WagmiProvider config={config} reconnectOnMount={true}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </WagmiProvider>
  </ThemeProvider>
);

// Only use StrictMode in development to avoid double mounting
const rootElement = document.getElementById("root") as HTMLElement;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);

  if (import.meta.env.DEV) {
    root.render(
      <React.StrictMode>
        <AppWithProviders />
      </React.StrictMode>,
    );
  } else {
    root.render(<AppWithProviders />);
  }
}
