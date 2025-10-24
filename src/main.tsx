import { QueryClient } from "@tanstack/react-query";
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
import { useConnectionRecovery } from "./hooks/use-connection-recovery";

// Component to activate connection recovery at the app level
function ConnectionRecoveryManager() {
  useConnectionRecovery();
  return null;
}
import "./lib/favicon"; // Initialize favicon manager
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "zamm-cache-v1", // bump this to bust cache on schema changes
  throttleTime: 1000,
});

// Configure query client with performance optimizations and error handling
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "offlineFirst", // keep old data when offline/down
      // Reduce the frequency of background refetches
      staleTime: 60_000, // 60 seconds
      gcTime: 7 * 24 * 60 * 60 * 1000, // 24 hours
      refetchInterval: false,
      refetchOnWindowFocus: false,
      // Retry with exponential backoff
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // Don't retry mutations on connector errors
      retry: (failureCount, error) => {
        const errorMessage = (error as Error)?.message || "";
        // Don't retry on connector errors
        if (
          errorMessage.includes("getChainId is not a function") ||
          errorMessage.includes("connector") ||
          errorMessage.includes("User rejected")
        ) {
          return false;
        }
        return failureCount < 2;
      },
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
    <WagmiProvider
      config={config}
      reconnectOnMount={true}
      // Add error handling for connector issues
      initialState={undefined}
    >
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 24 * 60 * 60 * 1000, // drop persisted data older than 24h
          dehydrateOptions: {
            // Persist only the queries you want (saves space)
            shouldDehydrateQuery: (q) => String(q.queryKey[0]).startsWith("coins-table"),
          },
        }}
      >
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
          <ConnectionRecoveryManager />
          {children}
        </RainbowKitProvider>
      </PersistQueryClientProvider>
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
