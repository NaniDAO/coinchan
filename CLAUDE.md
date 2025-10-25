# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Coinchan is a web3 application built with React, Vite, and TypeScript. It provides a platform for creating, trading, and managing crypto tokens/coins with features like trading, swapping, limit orders, prediction markets, liquidity management, farming, staking, and token creation. The application integrates with blockchain via Wagmi/Viem and supports Farcaster frames.

## Development Commands

```bash
# Install dependencies (must use pnpm)
pnpm install

# Start the development server
pnpm dev

# Build the project (includes TypeScript check)
pnpm build

# Preview the production build
pnpm preview

# Lint the code with Biome
pnpm lint

# Format the code with Biome (auto-fix)
pnpm format

# Verify code quality (format + build)
pnpm check
```

## Architecture

### Key Technologies

- **Frontend Framework**: React 18 with TypeScript 5.4 (strict mode)
- **Build Tool**: Vite 6.3 with TailwindCSS v4 plugin
- **Routing**: TanStack Router 1.121 with file-based routing and automatic code splitting
- **State Management**: React Query 5.85 with persistent localStorage caching (24-hour retention)
- **Styling**: Tailwind CSS 4.1 + class-variance-authority (CVA) for component variants
- **UI Components**: Radix UI primitives (dialog, dropdown, tabs, slider, etc.)
- **Web3 Integration**: Wagmi 2.16 + Viem 2.29 + RainbowKit 2.2
- **Blockchain RPC**: Multi-endpoint fallback (DRPC with batching, Alchemy, Cloudflare)
- **Internationalization**: react-i18next 15.5 with auto language detection (English, Chinese)
- **Data Visualization**: Recharts 2.15 + lightweight-charts 5.0
- **Code Quality**: Biome 1.8 (linter & formatter)
- **Utilities**: Zod (validation), GraphQL Request, Framer Motion, Sonner (toasts)

### Provider Hierarchy (main.tsx)

The application wraps components in this specific order:
```
ThemeProvider (dark/light mode)
  └─ WalletProviders
      ├─ WagmiProvider (blockchain config)
      ├─ PersistQueryClientProvider (React Query + localStorage)
      ├─ RainbowKitProvider (wallet UI)
      ├─ ConnectionErrorHandler (Web3 error boundary)
      └─ RouterProvider (TanStack Router)
```

### Routing Architecture

- **Type**: File-based routing via TanStack Router with automatic route tree generation
- **Route Files**: `/src/routes/**/*.tsx` (generates `/src/routeTree.gen.ts`)
- **Root Layout**: `/src/routes/__root.tsx` contains global navigation, header, and mobile menu
- **Key Routes**:
  - `/` - Landing page with instant trade action
  - `/swap` - Token swapping interface
  - `/limit` - Limit orders
  - `/predict` - Prediction markets
  - `/send` - Token transfers
  - `/explore/*` - Token/pool exploration
  - `/positions` - Liquidity positions
  - `/farm`, `/stake` - Yield farming & staking
  - `/create` - Token creation
  - `/raise` - Token launches
  - `/c/:coinId` - Individual coin details
- **Navigation**: Use `useNavigate()` hook from TanStack Router, NOT react-router

### State Management Pattern

1. **Global State**: Theme (React Context) + Wagmi connection state
2. **Server State**: React Query with:
   - Stale time: 60 seconds (reduces network calls)
   - Cache time: 7 days in localStorage
   - Offline-first mode (uses cached data when offline)
   - Conditional refetches disabled by default
3. **Persistence**: LocalStorage via `@tanstack/query-sync-storage-persister`

### Web3 Configuration

**Wagmi Setup** (`/src/wagmi.ts`):
- **Network**: Ethereum mainnet only (chain sync disabled)
- **RPC Endpoints**: Multi-endpoint fallback with batching
  1. DRPC (primary) - Batches up to 100 requests within 10ms, 1MB max batch size
  2. Alchemy (fallback)
  3. Cloudflare (final fallback)
- **Wallet Connectors**: Via RainbowKit (Farcaster Frame, injected, Coinbase, MetaMask)
- **Features**: Auto-reconnect on mount

**Contract ABIs** (`/src/constants/`):
- ZAMM (zAMM protocol)
- zCurve (bonding curve)
- ZRouter (routing)
- Prediction Markets
- Farming contracts (zChef)
- ICO contracts
- Wrapping contracts (ERC6909)
- Uniswap Universal Router
- Chainlink Aggregators

### Directory Structure

- `/src/components/` - React components
  - `/ui/` - Radix UI-based primitives
  - `/ui/8bit/` - Retro/8-bit styled components
  - `/explorer/` - Token/pool exploration
  - `/pools/` - Liquidity pool components
  - `/swap/` - Swap interface
  - `/trade/` - Trading components
  - `/farm/` - Farming interface
  - `/predict/` - Prediction market
  - `/raise/` - Token launch forms
  - `/create/` - Token creation
- `/src/routes/` - TanStack Router file-based routes
- `/src/hooks/` - Custom React hooks (20+ hooks for data fetching, transactions, etc.)
- `/src/lib/` - Utility functions and helpers
  - `utils.ts` - cn(), formatNumber(), formatting utilities
  - `theme.tsx` - Theme context provider
  - `zCurveClientCalc.ts` - zCurve protocol calculations
  - `zrouter.ts` - ZRouter protocol utilities
  - `pools.ts` - Pool management
  - `swap.ts` - Swap logic
  - `address.ts` - Address utilities
  - `ConnectionErrorHandler.tsx` - Web3 error handling
- `/src/constants/` - Contract ABIs & addresses (28+ files)
- `/src/types/` - TypeScript type definitions
- `/src/contexts/` - React context providers
- `/src/i18n/` - Internationalization setup
  - `/locales/en.json` - English translations (~1000+ keys)
  - `/locales/zh.json` - Chinese translations
- `/src/styles/` - Global styles
- `/src/index.css` - Tailwind imports + CSS custom properties
- `/src/wagmi.ts` - Wagmi configuration
- `/src/main.tsx` - React entry point

## Development Patterns

### 1. Component Creation

Use Radix UI primitives with Tailwind classes and CVA for variants:

```typescript
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center",
  {
    variants: {
      variant: { default: "...", ghost: "..." },
      size: { default: "h-9", sm: "h-8" }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

export const Button = forwardRef(({ variant, size, className, ...props }, ref) => (
  <button
    className={cn(buttonVariants({ variant, size }), className)}
    ref={ref}
    {...props}
  />
));
```

### 2. Data Fetching with React Query

Create custom hooks in `/src/hooks/` following this pattern:

```typescript
import { useQuery } from "@tanstack/react-query";

export const useCoinPrice = ({ token }: { token?: Token }) => {
  return useQuery({
    queryKey: ["coin-price", token?.id?.toString()],
    queryFn: async () => {
      // fetch logic
    },
    enabled: !!token, // Conditional query
    staleTime: 60_000, // 60 seconds
  });
};
```

**Important**: React Query is configured with:
- 60-second stale time by default
- Offline-first mode
- Persistent caching in localStorage

### 3. Routing with TanStack Router

Create route files in `/src/routes/` following this pattern:

```typescript
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute('/swap')({
  component: SwapPage,
  errorComponent: ErrorBoundary,
});

function SwapPage() {
  const navigate = Route.useNavigate();
  const params = Route.useParams();
  return <div>...</div>;
}
```

**Critical**: Always use TanStack Router hooks (`useNavigate`, `useParams`, etc.), NOT react-router hooks.

### 4. Web3 Transactions

Use Wagmi hooks for blockchain interactions:

```typescript
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACT_ABI } from "@/constants/MyContract";

const { address } = useAccount();
const { writeContract, data: hash } = useWriteContract();
const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });

const handleSwap = async () => {
  writeContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'swap',
    args: [...]
  });
};
```

**Pattern**: All contract ABIs are in `/src/constants/`, reference them there.

### 5. Styling with Tailwind + Theme

- Use Tailwind classes for styling
- Dark mode is class-based (`.dark` on `<html>`)
- CSS custom properties for theming:
  - Colors: `--background`, `--foreground`, `--accent`, `--destructive`, etc.
  - Typography: `--font-sans`, `--font-mono`, `--font-display`
- Use `cn()` utility from `@/lib/utils` to merge classes
- Access theme via `useTheme()` hook from `@/lib/theme`

### 6. Internationalization

Always use translation keys, never hardcoded text:

```typescript
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
const text = t('common.swap'); // Dot notation for nested keys
```

**Translation Files**: `/src/i18n/locales/en.json` and `/src/i18n/locales/zh.json`

**Supported Languages**: English (en), Chinese (zh)

**Features**: Auto-detection via query string, cookie, localStorage, or navigator

### 7. Performance Considerations

- **Code Splitting**: TanStack Router automatically code-splits routes
- **RPC Batching**: Wagmi batches blockchain calls (max 100 requests per 10ms)
- **Query Caching**: React Query caches for 7 days in localStorage
- **Conditional Queries**: Always use `enabled` flag to prevent unnecessary fetches

## Important Configuration Files

- **vite.config.ts**: TanStack Router plugin MUST come before React plugin
- **tsconfig.json**: Strict mode enabled, path alias `@` → `./src`
- **tailwind.config.js**: Dark mode class-based, custom Diamond colors
- **biome.json**: 120-char line width, enabled linter & formatter
- **package.json**: Must use pnpm (has overrides for security patches)