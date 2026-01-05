import { useState, useEffect, useCallback } from "react";
import { type Address, getAddress, erc20Abi } from "viem";
import { usePublicClient } from "wagmi";
import type { TokenMeta } from "@/lib/coins";

const STORAGE_KEY = "custom_tokens_v1";
const MAX_CUSTOM_TOKENS = 100;

interface CustomTokenStorage {
	address: string;
	symbol: string;
	name: string;
	decimals: number;
	addedAt: number;
}

export function useCustomTokens() {
	const [customTokens, setCustomTokens] = useState<TokenMeta[]>([]);
	const publicClient = usePublicClient();

	// Load from localStorage on mount
	useEffect(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed: CustomTokenStorage[] = JSON.parse(stored);
				const tokens: TokenMeta[] = parsed.map((t) => ({
					id: 0n,
					token1: t.address as Address,
					symbol: t.symbol,
					name: t.name,
					decimals: t.decimals,
					source: "ERC20" as const,
					balance: 0n,
				}));
				setCustomTokens(tokens);
			}
		} catch (error) {
			console.error("Failed to load custom tokens", error);
			localStorage.removeItem(STORAGE_KEY);
		}
	}, []);

	const addCustomToken = useCallback(
		async (address: Address): Promise<TokenMeta | null> => {
			if (!publicClient) return null;

			try {
				// Validate and checksum address
				const checksummedAddress = getAddress(address);

				// Check if already exists
				const existing = customTokens.find(
					(t) => t.token1?.toLowerCase() === checksummedAddress.toLowerCase(),
				);
				if (existing) {
					throw new Error("Token already added");
				}

				// Check limit
				if (customTokens.length >= MAX_CUSTOM_TOKENS) {
					throw new Error("Maximum custom tokens reached");
				}

				// Fetch metadata
				const results = await publicClient.multicall({
					contracts: [
						{
							address: checksummedAddress,
							abi: erc20Abi,
							functionName: "symbol",
						},
						{
							address: checksummedAddress,
							abi: erc20Abi,
							functionName: "decimals",
						},
						{
							address: checksummedAddress,
							abi: erc20Abi,
							functionName: "name",
						},
					],
				});

				const symbolResult = results[0];
				const decimalsResult = results[1];
				const nameResult = results[2];

				if (
					symbolResult.status !== "success" ||
					decimalsResult.status !== "success"
				) {
					throw new Error("Not a valid ERC20 token");
				}

				const symbol = symbolResult.result as string;
				const decimals = Number(decimalsResult.result);
				const name =
					nameResult.status === "success"
						? (nameResult.result as string)
						: symbol;

				const newToken: TokenMeta = {
					id: 0n,
					token1: checksummedAddress,
					symbol,
					name,
					decimals,
					source: "ERC20",
					balance: 0n,
				};

				// Update state and localStorage
				const updatedTokens = [...customTokens, newToken];
				setCustomTokens(updatedTokens);

				const storageData: CustomTokenStorage[] = updatedTokens.map((t) => ({
					address: t.token1 as string,
					symbol: t.symbol,
					name: t.name,
					decimals: t.decimals as number,
					addedAt: Date.now(),
				}));
				localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));

				return newToken;
			} catch (error) {
				console.error("Failed to add custom token", error);
				throw error;
			}
		},
		[customTokens, publicClient],
	);

	const removeCustomToken = useCallback(
		(address: Address) => {
			const checksummedAddress = getAddress(address);
			const updatedTokens = customTokens.filter(
				(t) => t.token1?.toLowerCase() !== checksummedAddress.toLowerCase(),
			);
			setCustomTokens(updatedTokens);

			const storageData: CustomTokenStorage[] = updatedTokens.map((t) => ({
				address: t.token1 as string,
				symbol: t.symbol,
				name: t.name,
				decimals: t.decimals as number,
				addedAt: Date.now(),
			}));
			localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
		},
		[customTokens],
	);

	const isCustomToken = useCallback(
		(address?: string): boolean => {
			if (!address) return false;
			try {
				const checksummedAddress = getAddress(address as Address);
				return customTokens.some(
					(t) => t.token1?.toLowerCase() === checksummedAddress.toLowerCase(),
				);
			} catch {
				return false;
			}
		},
		[customTokens],
	);

	return {
		customTokens,
		addCustomToken,
		removeCustomToken,
		isCustomToken,
	};
}
