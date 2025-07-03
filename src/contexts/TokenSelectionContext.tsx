import React, { createContext, useContext, useState, ReactNode } from "react";
import { TokenMeta, ETH_TOKEN } from "../lib/coins";

interface TokenSelectionContextType {
  sellToken: TokenMeta;
  buyToken: TokenMeta | null;
  setSellToken: (token: TokenMeta) => void;
  setBuyToken: (token: TokenMeta | null) => void;
  flipTokens: () => void;
}

const TokenSelectionContext = createContext<TokenSelectionContextType | undefined>(undefined);

export const useTokenSelection = () => {
  const context = useContext(TokenSelectionContext);
  if (context === undefined) {
    throw new Error("useTokenSelection must be used within a TokenSelectionProvider");
  }
  return context;
};

interface TokenSelectionProviderProps {
  children: ReactNode;
}

export const TokenSelectionProvider: React.FC<TokenSelectionProviderProps> = ({ children }) => {
  const [sellToken, setSellTokenState] = useState<TokenMeta>(ETH_TOKEN);
  const [buyToken, setBuyTokenState] = useState<TokenMeta | null>(null);

  const setSellToken = (token: TokenMeta) => {
    setSellTokenState(token);
  };

  const setBuyToken = (token: TokenMeta | null) => {
    setBuyTokenState(token);
  };

  const flipTokens = () => {
    if (buyToken && sellToken) {
      const newSellToken = buyToken;
      const newBuyToken = sellToken;
      setSellTokenState(newSellToken);
      setBuyTokenState(newBuyToken);
    }
  };

  const value: TokenSelectionContextType = {
    sellToken,
    buyToken,
    setSellToken,
    setBuyToken,
    flipTokens,
  };

  return <TokenSelectionContext.Provider value={value}>{children}</TokenSelectionContext.Provider>;
};
