import { useQuery } from "@tanstack/react-query";

const TOKENLIST_URL = "https://assets.zamm.finance/tokenlist.json";

type AiMeta = { tags?: string[]; description?: string };
type TokenExtensions = {
  standard?: string;
  id?: string;
  tokenURI?: string;
  ai?: AiMeta;
};
type Token = {
  chainId: number;
  address: string;
  decimals: number;
  name: string;
  symbol: string;
  logoURI?: string;
  extensions?: TokenExtensions;
};
type TokenList = {
  name: string;
  timestamp: string;
  version: { major: number; minor: number; patch: number };
  tokens: Token[];
};

function normalizeAddress(addr: string) {
  return addr.trim().toLowerCase();
}

function pickAiMeta(
  list: TokenList,
  address: string,
  id?: string,
): AiMeta | undefined {
  const addr = normalizeAddress(address);
  const matches = list.tokens.filter(
    (t) => normalizeAddress(t.address) === addr,
  );
  if (!matches.length) return undefined;
  if (id !== undefined) {
    const withId = matches.find((t) => t.extensions?.id === String(id));
    return withId?.extensions?.ai;
  }
  const noId = matches.find((t) => !t.extensions?.id);
  return (noId ?? matches[0])?.extensions?.ai;
}

export const useGetAiMeta = (address?: string, id?: string) => {
  return useQuery({
    queryKey: ["zamm-tokenlist-ai", TOKENLIST_URL, address ?? null, id ?? null],
    enabled: Boolean(address && address.trim().length > 0),
    // Add method, headers, and cors mode. Also wire up AbortSignal for React Query.
    queryFn: async ({ signal }) => {
      let res: Response;
      try {
        res = await fetch(TOKENLIST_URL, {
          method: "GET",
          mode: "cors",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
          signal,
        });
      } catch (e) {
        console.error(e);
        // Network layer error (CORS, DNS, offline, blocked, etc.)
        throw new Error(
          e instanceof Error
            ? `Network error: ${e.message}`
            : "Network error fetching token list",
        );
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching token list`);
      }

      // Some CORS failures produce opaque responses; guard by checking content-type if available
      const contentType = res.headers.get("content-type") || "";
      if (contentType && !contentType.includes("application/json")) {
        // Still try to parse, but warn in the error if it fails
        try {
          const maybeJson = await res.json();
          // Parsed fine despite header—continue
          if (!address) return undefined;
          return pickAiMeta(maybeJson as TokenList, address, id);
        } catch {
          throw new Error(
            `Unexpected content-type: "${contentType}". The server may be blocking CORS.`,
          );
        }
      }

      const data = (await res.json()) as TokenList;
      if (!address) return undefined;
      return pickAiMeta(data, address, id);
    },
    // Small retry in case of transient network/CORS flake
    retry: (failureCount, error) => {
      if (/CORS|content-type|HTTP 4\d\d/i.test(String(error))) return false;
      return failureCount < 2;
    },
    staleTime: 60_000,
  });
};
