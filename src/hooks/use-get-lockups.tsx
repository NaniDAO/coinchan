import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";

const API_URL = import.meta.env.VITE_INDEXER_URL + "/graphql";

// Define the GraphQL query for lockups
const GET_LOCKUPS_QUERY = `
  query GetLockups($address: String!) {
    account(address: $address) {
      address
      lockupSent {
        items {
          id
          token
          coinId
          sender
          to
          amount
          unlockTime
          createdAt
          txHash
          coin {
            name
            symbol
            decimals
            imageUrl
          }
        }
      }
      lockupReceived {
        items {
          id
          token
          coinId
          sender
          to
          amount
          unlockTime
          createdAt
          txHash
          coin {
            name
            symbol
            decimals
            imageUrl
          }
        }
      }
    }
  }
`;

// Define the types for lockup data
export interface LockupData {
  id: string;
  token: string | null;
  coinId: string | null;
  sender: string;
  to: string | null;
  amount: string | null;
  unlockTime: string | null;
  createdAt: string;
  txHash: string;
  coin?: {
    name: string | null;
    symbol: string | null;
    decimals: number;
    imageUrl: string | null;
  } | null;
}

interface LockupsResponse {
  address: string;
  lockupSent: {
    items: LockupData[] | null;
  };
  lockupReceived: {
    items: LockupData[] | null;
  };
}

// Create the React Query hook
export const useGetLockups = ({ address }: { address?: Address }) => {
  return useQuery<LockupsResponse, Error>({
    queryKey: ["getLockups", address],
    queryFn: async () => {
      if (!address) {
        throw new Error("Address is required");
      }

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: GET_LOCKUPS_QUERY,
          variables: { address },
        }),
      });

      if (!response.ok) {
        let errorMessage = `GraphQL request failed with status ${response.status}`;
        try {
          const errorBody = await response.json();
          if (errorBody.errors && errorBody.errors.length > 0) {
            errorMessage = errorBody.errors.map((err: any) => err.message).join(", ");
          } else if (errorBody.message) {
            errorMessage = errorBody.message;
          }
        } catch (e) {
          // If parsing JSON fails, use the default error message
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors.map((err: any) => err.message).join(", "));
      }

      return result.data.account as LockupsResponse;
    },
    enabled: !!address, // Only run the query if address is provided
  });
};