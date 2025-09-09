export const getInitials = (symbol?: string) =>
  symbol?.slice(0, 2).toUpperCase() ?? "";

export const getColorForSymbol = (symbol?: string) => {
  const symbolKey = symbol?.toLowerCase() ?? "";
  const colorMap: Record<string, { bg: string; text: string }> = {
    eth: { bg: "bg-black", text: "text-white" },
    za: { bg: "bg-red-500", text: "text-white" },
    pe: { bg: "bg-green-700", text: "text-white" },
    ro: { bg: "bg-red-700", text: "text-white" },
    "..": { bg: "bg-gray-800", text: "text-white" },
  };
  const initials = symbolKey.slice(0, 2);
  return colorMap[initials] || { bg: "bg-yellow-500", text: "text-white" };
};

export const specialLogos: Record<string, string> = {
  ZAMM: "/zammzamm.gif",
  ENS: "/ens.svg",
  CULT: "/cult.jpg",
  WLFI: "/wlfi.png",
};
