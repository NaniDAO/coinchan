import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";

const API_URL = import.meta.env.VITE_INDEXER_URL + "/graphql";

// Define the GraphQL query
const GET_ACCOUNT_QUERY = `
  query GetAccount($address: String!) {
    account(address: $address) {
      address
      createdAt
      transferSender {
        items {
          amount
          blockNumber
          coinId
          createdAt
          id
          txHash
          coin {
            name
            symbol
          }
          from {
            address
          }
          to {
            address
          }
          sender {
            address
          }
        }
      }
      transfersFrom {
        items {
          amount
          blockNumber
          coinId
          createdAt
          id
          txHash
          coin {
            name
            symbol
          }
          from {
            address
          }
          to {
            address
          }
          sender {
            address
          }
        }
      }
      coinsBalanceOf {
        items {
          address
          balance
          coinId
          createdAt
          updatedAt
          coin {
            name
            symbol
          }
        }
      }
      coinsOwnerOf {
        items {
          createdAt
          creationTxHash
          decimals
          description
          id
          imageUrl
          name
          owner
          symbol
          tokenURI
          totalSupply
          updatedAt
        }
      }
      transfersTo {
        items {
          amount
          blockNumber
          coinId
          createdAt
          id
          txHash
          coin {
            name
            symbol
          }
          from {
            address
          }
          to {
            address
          }
          sender {
            address
          }
        }
      }
    }
  }
`;

// Define the types for the query response based on the provided example
export interface AccountTransfer {
  amount: string;
  blockNumber: string;
  coinId: string;
  createdAt: string;
  id: string;
  txHash: string;
  sender: {
    address: string;
  };
  from: {
    address: string;
  };
  to: {
    address: string;
  };
  coin: {
    name: string;
    symbol: string;
  };
}

export interface AccountCoinsBalanceOf {
  address: string;
  balance: string;
  coinId: string;
  createdAt: string;
  updatedAt: string;
  coin: {
    name: string;
    symbol: string;
  };
}

interface AccountCoinsOwnerOf {
  createdAt: string;
  creationTxHash: string;
  decimals: number;
  description: string | null;
  id: string;
  imageUrl: string | null;
  name: string | null;
  owner: string;
  symbol: string | null;
  tokenURI: string | null;
  totalSupply: string | null;
  updatedAt: string | null;
}

interface AccountData {
  address: string;
  createdAt: string;
  transferSender: {
    items: AccountTransfer[] | null;
  };
  transfersFrom: {
    items: AccountTransfer[] | null;
  };
  coinsBalanceOf: {
    items: AccountCoinsBalanceOf[] | null;
  };
  coinsOwnerOf: {
    items: AccountCoinsOwnerOf[] | null;
  };
  transfersTo: {
    items: AccountTransfer[] | null;
  };
}

// Create the React Query hook
export const useGetAccount = ({ address }: { address?: Address }) => {
  return useQuery<AccountData, Error>({
    queryKey: ["getAccount", address],
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
          query: GET_ACCOUNT_QUERY,
          variables: { address },
        }),
      });

      if (!response.ok) {
        // Attempt to read the error message from the response body
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

      return result.data.account as AccountData;
    },
    enabled: !!address, // Only run the query if address is provided
  });
};
