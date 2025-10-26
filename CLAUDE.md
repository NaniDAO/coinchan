# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Coinchan is a web3 application built with React, Vite, and TypeScript. It provides a platform for creating, trading, and managing crypto tokens/coins with features like trading, exploration, sending, and creating new coins. The application integrates with blockchain via Wagmi and supports Farcaster frames.

## Development Commands

```bash
# Install dependencies
pnpm install

# Start the development server
pnpm dev

# Build the project
pnpm build

# Preview the production build
pnpm preview

# Lint the code
pnpm lint

# Format the code
pnpm format
```

## Architecture

### Key Technologies

- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: TanStack Router (`@tanstack/react-router`)
- **State Management**: React Query (`@tanstack/react-query`)
- **Styling**: Tailwind CSS v4 with components built on Radix UI primitives
- **Web3 Integration**: Wagmi & Viem for Ethereum blockchain interactions
- **Farcaster Integration**: Farcaster Frame SDK for social embedding
- **Internationalization**: React-i18next for multi-language support (English, Chinese)

### Core Components

1. **Providers Structure**:
   - `ThemeProvider`: Manages light/dark theme
   - `WagmiProvider`: Handles blockchain connections
   - `QueryClientProvider`: Manages data fetching
   - `RouterProvider`: Handles routing
   - `I18nextProvider`: Manages translations and language switching

2. **Web3 Integration**:
   - Supports multiple wallet connectors (Farcaster Frame, injected, Coinbase, MetaMask)
   - Configured for Ethereum mainnet

3. **UI Component System**:
   - Uses Radix UI primitives with Tailwind for styling
   - Component variants managed via class-variance-authority (cva)

4. **Blockchain Components**:
   - `ConnectMenu`: For wallet connection
   - Various components for interacting with coins/tokens
   - Chart components for displaying trading data

5. **Internationalization**:
   - Language files in `/src/i18n/locales/` (en.json, zh.json)
   - Language switcher component in the UI
   - All text is translated via translation keys

### Key Features

1. **Trading**: View and trade crypto coins
2. **Exploration**: Discover and browse coins
3. **Send**: Transfer coins to other addresses
4. **Create**: Create new coins with customizable parameters
5. **Internationalization**: Support for multiple languages (English, Chinese)

### Directory Structure

- `/src/components`: UI components, including Radix UI-based components in `/ui`
- `/src/constants`: Contract ABIs and blockchain-related constants
- `/src/hooks`: Custom hooks for data fetching and state management
- `/src/lib`: Utility functions and helpers
- `/src/routes`: TanStack Router route definitions
- `/src/i18n`: Internationalization setup and translation files

## Development Patterns

1. **Component Creation**:
   - Follow the existing pattern of using Radix UI primitives with Tailwind classes
   - Use the class-variance-authority (cva) pattern for component variants

2. **Styling**:
   - Use Tailwind CSS for styling
   - Follow the dark/light theme pattern established in the codebase

3. **Data Fetching**:
   - Use React Query hooks for data fetching
   - Create custom hooks in the `/hooks` directory for reusable data fetching logic

4. **Blockchain Interactions**:
   - Use Wagmi hooks for blockchain interactions
   - Reference contract ABIs and addresses from the `/constants` directory

5. **Internationalization**:
   - Use the `useTranslation` hook from react-i18next to access translations
   - Use translation keys instead of hardcoded text
   - Maintain translation files in `/src/i18n/locales/`