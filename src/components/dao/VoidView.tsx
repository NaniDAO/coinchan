import { useState } from "react";
import { motion } from "framer-motion";
import { Network, Coins as CoinsIcon, Vault, Shield, User } from "lucide-react";
import { DataNode } from "./DataNode";

export type ViewMode =
  | "void"
  | "proposals"
  | "voting"
  | "stats"
  | "join"
  | "create"
  | "treasury"
  | "governance"
  | "membership";

interface VoidViewProps {
  onSelectMode: (mode: ViewMode) => void;
}

export const VoidView = ({ onSelectMode }: VoidViewProps) => {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Position nodes in corners and edges of the viewport
  const nodes = [
    { id: "proposals", label: "PROPOSALS", icon: Network, corner: "top" },
    { id: "treasury", label: "TREASURY", icon: Vault, corner: "left" },
    { id: "governance", label: "GOVERNANCE", icon: Shield, corner: "right" },
    {
      id: "membership",
      label: "MEMBERSHIP",
      icon: User,
      corner: "bottom-left",
    },
    {
      id: "create",
      label: "CREATE",
      icon: CoinsIcon,
      corner: "bottom-right",
    },
  ];

  // Get color based on corner
  const getColorForCorner = (corner: string) => {
    const colors = {
      top: "#FF0000", // Pure Red
      left: "#FF00FF", // Pure Magenta
      right: "#00FFFF", // Pure Cyan
      "bottom-left": "#FFFF00", // Pure Yellow
      "bottom-right": "#0000FF", // Pure Blue
    };
    return colors[corner as keyof typeof colors] || "#FFFFFF";
  };

  // Get the color of the currently hovered node
  const hoveredColor = hoveredNode ? getColorForCorner(nodes.find((n) => n.id === hoveredNode)?.corner || "") : null;

  return (
    <>
      {/* Central Core - Absolutely positioned */}
      <motion.div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 cursor-pointer"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1, delay: 0.5 }}
        onClick={() => onSelectMode("join")}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <motion.div
          className="w-32 h-32 border-2 bg-white rounded-full flex items-center justify-center relative"
          animate={{
            borderColor: hoveredColor || "rgba(255,255,255,0.4)",
            boxShadow: hoveredColor ? `0 0 60px ${hoveredColor}, 0 0 100px ${hoveredColor}` : "none",
          }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="absolute inset-0 border-2 rounded-full animate-ping"
            animate={{
              borderColor: hoveredColor || "rgba(255,255,255,0.2)",
            }}
            transition={{ duration: 0.2 }}
          />
          <div className="flex flex-col font-mono text-4xl text-black">
            <span className="tracking-widest">ZO</span>
            <span className="tracking-widest">RG</span>
          </div>
        </motion.div>
      </motion.div>

      {/* Data Nodes in Corners */}
      {nodes.map((node, i) => (
        <DataNode
          key={node.id}
          {...node}
          delay={0.7 + i * 0.1}
          onClick={() => onSelectMode(node.id as ViewMode)}
          onHoverChange={(isHovered) => setHoveredNode(isHovered ? node.id : null)}
        />
      ))}

      {/* Connection Lines from center to corners */}
      <svg className="fixed inset-0 w-full h-full pointer-events-none z-5">
        {/* Line to proposals (top) */}
        <motion.line
          x1="50%"
          y1="50%"
          x2="50%"
          y2="15%"
          strokeWidth="1"
          initial={{ pathLength: 0 }}
          animate={{
            pathLength: 1,
            stroke: hoveredNode === "proposals" ? getColorForCorner("top") : "white",
            strokeWidth: hoveredNode === "proposals" ? 3 : 1,
            filter: hoveredNode === "proposals" ? `drop-shadow(0 0 10px ${getColorForCorner("top")})` : "none",
          }}
          transition={{ duration: 1, delay: 1 }}
        />
        {/* Line to voting (left) */}
        <motion.line
          x1="50%"
          y1="50%"
          x2="10%"
          y2="50%"
          strokeWidth="1"
          initial={{ pathLength: 0 }}
          animate={{
            pathLength: 1,
            stroke: hoveredNode === "voting" ? getColorForCorner("left") : "white",
            strokeWidth: hoveredNode === "voting" ? 3 : 1,
            filter: hoveredNode === "voting" ? `drop-shadow(0 0 10px ${getColorForCorner("left")})` : "none",
          }}
          transition={{ duration: 1, delay: 1.1 }}
        />
        {/* Line to stats (right) */}
        <motion.line
          x1="50%"
          y1="50%"
          x2="90%"
          y2="50%"
          strokeWidth="1"
          initial={{ pathLength: 0 }}
          animate={{
            pathLength: 1,
            stroke: hoveredNode === "stats" ? getColorForCorner("right") : "white",
            strokeWidth: hoveredNode === "stats" ? 3 : 1,
            filter: hoveredNode === "stats" ? `drop-shadow(0 0 10px ${getColorForCorner("right")})` : "none",
          }}
          transition={{ duration: 1, delay: 1.2 }}
        />
        {/* Line to join (bottom-left) */}
        <motion.line
          x1="50%"
          y1="50%"
          x2="10%"
          y2="81%"
          strokeWidth="1"
          initial={{ pathLength: 0 }}
          animate={{
            pathLength: 1,
            stroke: hoveredNode === "join" ? getColorForCorner("bottom-left") : "white",
            strokeWidth: hoveredNode === "join" ? 3 : 1,
            filter: hoveredNode === "join" ? `drop-shadow(0 0 10px ${getColorForCorner("bottom-left")})` : "none",
          }}
          transition={{ duration: 1, delay: 1.3 }}
        />
        {/* Line to create (bottom-right) */}
        <motion.line
          x1="50%"
          y1="50%"
          x2="90%"
          y2="81%"
          strokeWidth="1"
          initial={{ pathLength: 0 }}
          animate={{
            pathLength: 1,
            stroke: hoveredNode === "create" ? getColorForCorner("bottom-right") : "white",
            strokeWidth: hoveredNode === "create" ? 3 : 1,
            filter: hoveredNode === "create" ? `drop-shadow(0 0 10px ${getColorForCorner("bottom-right")})` : "none",
          }}
          transition={{ duration: 1, delay: 1.4 }}
        />
      </svg>
    </>
  );
};
