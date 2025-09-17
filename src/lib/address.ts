export const truncAddress = (address: string): string => {
  if (!address) return "";
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

export const contractsNameMap: Record<string, string> = {
  "0x00000000009991e374a1628e3b2f60991bc26da4": "zChef",
  "0x000000000069aa14fb673a86952eb0785f38911c": "zICO",
};
