import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";

import { ThemeProvider, useTheme } from "./lib/theme";
import { routeTree } from "./routeTree.gen";
import { config } from "./wagmi.ts";
import "@rainbow-me/rainbowkit/styles.css";
import { type Locale, RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";

import "./index.css";
import "./i18n";
import { useTranslation } from "react-i18next";
import ConnectionErrorHandler from "./lib/ConnectionErrorHandler";
import "./lib/favicon"; // Initialize favicon manager

// Configure query client with performance optimizations
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reduce the frequency of background refetches
      staleTime: 30000, // 30 seconds
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
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
const AppWithProviders = () => {
  return (
    <ThemeProvider>
      <WalletProviders>
        <RouterProvider router={router} />
        <Toaster />
      </WalletProviders>
    </ThemeProvider>
  );
};

export const WalletProviders = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { theme } = useTheme();
  const { i18n } = useTranslation();
  return (
    <WagmiProvider config={config} reconnectOnMount={true}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          coolMode
          locale={(i18n.language as Locale) ?? "en-US"}
          theme={
            theme === "light"
              ? lightTheme({
                  borderRadius: "small",
                  accentColor: "#000a0a",
                  accentColorForeground: "#eaeaea",
                  overlayBlur: "small",
                  fontStack: "system",
                })
              : darkTheme({
                  borderRadius: "small",
                  accentColor: "#eaeaea",
                  accentColorForeground: "#000a0a",
                  overlayBlur: "small",
                  fontStack: "system",
                })
          }
        >
          <ConnectionErrorHandler />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

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
