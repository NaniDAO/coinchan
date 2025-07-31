import { useTheme } from "@/lib/theme";

interface ChartTheme {
  background: string;
  textColor: string;
  lineColor: string;
  upColor: string;
  downColor: string;
  wickUpColor: string;
  wickDownColor: string;
  gridColor: string;
  crosshairColor: string;
}

export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  if (isDark) {
    return {
      background: "#12151a", // dark card background
      textColor: "#e6f0ff", // dark foreground text
      lineColor: "#00ccff", // primary color for charts
      upColor: "#33ff99", // chart-2 color
      downColor: "#ff3358", // destructive color
      wickUpColor: "#33ff99", // chart-2 color
      wickDownColor: "#ff3358", // destructive color
      gridColor: "#2a2d3a", // subtle grid for dark theme
      crosshairColor: "#6b7280", // gray crosshair for dark theme
    };
  }

  // Light theme
  return {
    background: "#ffffff",
    textColor: "#333333",
    lineColor: "#8b5cf6", // purple for light theme
    upColor: "#34d399", // green for light theme
    downColor: "#f87171", // red for light theme
    wickUpColor: "#34d399",
    wickDownColor: "#f87171",
    gridColor: "#f0f0f0", // subtle grid for light theme
    crosshairColor: "#9ca3af", // gray crosshair for light theme
  };
}
