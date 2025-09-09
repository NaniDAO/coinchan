import { SingleEthLiquidity } from "./SingleEthLiquidity";

// Simple wrapper that just uses the regular SingleEthLiquidity component
// which works with any Cookbook pool including WLFI
export const WLFIZapWrapper = () => {
  return <SingleEthLiquidity />;
};
