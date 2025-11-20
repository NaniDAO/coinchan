import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { X, Binary, Network, Vote, Coins as CoinsIcon } from "lucide-react";
import { ProposalList } from "./ProposalList";
import { VotingPower } from "./VotingPower";
import { DAOStats } from "./DAOStats";
import { JoinDAO } from "./JoinDAO";
import { CreateProposal } from "./CreateProposal";
import { useNavigate } from "@tanstack/react-router";

type ViewMode = "void" | "proposals" | "voting" | "stats" | "join" | "create";

export const CyberspaceDAO = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("void");
  const [isEntering, setIsEntering] = useState(true);

  useEffect(() => {
    // Entry animation
    const timer = setTimeout(() => setIsEntering(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleExit = () => {
    navigate({ to: "/" });
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white overflow-hidden">
      {/* Animated Grid Background */}
      <div className="absolute inset-0 overflow-hidden">
        <GridBackground />
        <Scanlines />
        <VignetteOverlay />
      </div>

      {/* Glitch Effect Overlay */}
      <GlitchOverlay />

      {/* Entry Animation */}
      <AnimatePresence>
        {isEntering && (
          <motion.div
            className="absolute inset-0 z-50 flex items-center justify-center bg-black"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, delay: 1 }}
          >
            <motion.div
              className="text-center"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              transition={{ duration: 0.8 }}
            >
              <Binary className="w-20 h-20 mx-auto mb-4 text-white animate-pulse" />
              <div className="font-mono text-2xl tracking-wider glitch-text">
                ENTERING ZORG CYBERSPACE
              </div>
              <div className="font-mono text-sm text-gray-400 mt-2">
                [ INITIALIZING NEURAL INTERFACE ]
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exit Button */}
      <motion.button
        onClick={handleExit}
        className="fixed top-6 right-6 z-50 p-3 border border-white/20 hover:border-white/60 bg-black/40 backdrop-blur-sm transition-all group"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <X className="w-6 h-6 text-white/60 group-hover:text-white transition-colors" />
      </motion.button>

      {/* Main Content */}
      <div className="relative z-10 h-full flex items-center justify-center p-8">
        {viewMode === "void" ? (
          <VoidView onSelectMode={setViewMode} />
        ) : (
          <ContentView mode={viewMode} onBack={() => setViewMode("void")} />
        )}
      </div>

      {/* Status Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-black/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-4">
            <span className="text-green-400">◉ ONLINE</span>
            <span className="text-gray-400">NETWORK: ETHEREUM MAINNET</span>
          </div>
          <div className="text-gray-400">
            ZORG DAO v1.0 • {new Date().toISOString().split("T")[0]}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes glitch {
          0%, 100% { transform: translate(0); }
          33% { transform: translate(-2px, 2px); }
          66% { transform: translate(2px, -2px); }
        }
        .glitch-text {
          animation: glitch 3s infinite;
        }
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        .scanline {
          animation: scan 8s linear infinite;
        }
      `}</style>
    </div>
  );
};

// Void View - The main navigation hub
const VoidView = ({ onSelectMode }: { onSelectMode: (mode: ViewMode) => void }) => {
  // Position nodes in corners and edges of the viewport
  const nodes = [
    { id: "proposals", label: "PROPOSALS", icon: Network, corner: "top" },
    { id: "voting", label: "VOTING POWER", icon: Vote, corner: "left" },
    { id: "stats", label: "STATISTICS", icon: Binary, corner: "right" },
    { id: "join", label: "JOIN DAO", icon: CoinsIcon, corner: "bottom-left" },
    { id: "create", label: "CREATE", icon: Network, corner: "bottom-right" },
  ];

  return (
    <>
      {/* Central Core - Absolutely positioned */}
      <motion.div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1, delay: 0.5 }}
      >
        <div className="w-32 h-32 border-2 border-white/40 rounded-full flex items-center justify-center relative">
          <div className="absolute inset-0 border-2 border-white/20 rounded-full animate-ping" />
          <Binary className="w-12 h-12 text-white" />
          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <div className="font-mono text-sm text-white/60">ZORG DAO</div>
          </div>
        </div>
      </motion.div>

      {/* Data Nodes in Corners */}
      {nodes.map((node, i) => (
        <DataNode
          key={node.id}
          {...node}
          delay={0.7 + i * 0.1}
          onClick={() => onSelectMode(node.id as ViewMode)}
        />
      ))}

      {/* Connection Lines from center to corners */}
      <svg className="fixed inset-0 w-full h-full pointer-events-none z-5">
        <motion.line
          x1="50%"
          y1="50%"
          x2="50%"
          y2="15%"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, delay: 1 }}
        />
        <motion.line
          x1="50%"
          y1="50%"
          x2="15%"
          y2="50%"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, delay: 1.1 }}
        />
        <motion.line
          x1="50%"
          y1="50%"
          x2="85%"
          y2="50%"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
        />
        <motion.line
          x1="50%"
          y1="50%"
          x2="20%"
          y2="85%"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, delay: 1.3 }}
        />
        <motion.line
          x1="50%"
          y1="50%"
          x2="80%"
          y2="85%"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, delay: 1.4 }}
        />
      </svg>
    </>
  );
};

// Data Node - Interactive navigation point
const DataNode = ({
  label,
  icon: Icon,
  corner,
  delay,
  onClick,
}: {
  label: string;
  icon: React.ElementType;
  corner: string;
  delay: number;
  onClick: () => void;
}) => {
  // Calculate position based on corner
  const getPositionStyles = (corner: string): React.CSSProperties => {
    const spacing = 80; // pixels from edge
    switch (corner) {
      case "top":
        return { top: spacing, left: "50%", transform: "translateX(-50%)" };
      case "left":
        return { left: spacing, top: "50%", transform: "translateY(-50%)" };
      case "right":
        return { right: spacing, top: "50%", transform: "translateY(-50%)" };
      case "bottom-left":
        return { bottom: spacing, left: spacing };
      case "bottom-right":
        return { bottom: spacing, right: spacing };
      default:
        return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    }
  };

  return (
    <motion.button
      className="fixed group z-20"
      style={getPositionStyles(corner)}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
    >
      <div className="relative">
        {/* Hex Border */}
        <div className="w-24 h-24 border-2 border-white/30 group-hover:border-white/80 transition-colors flex items-center justify-center bg-black/60 backdrop-blur-sm clip-hexagon">
          <Icon className="w-10 h-10 text-white/60 group-hover:text-white transition-colors" />
        </div>

        {/* Pulsing Ring */}
        <div className="absolute inset-0 border-2 border-white/10 clip-hexagon animate-ping opacity-0 group-hover:opacity-100" />

        {/* Label */}
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <div className="font-mono text-xs text-white/60 group-hover:text-white transition-colors tracking-wider">
            {label}
          </div>
        </div>
      </div>
    </motion.button>
  );
};

// Content View - Displays selected content
const ContentView = ({ mode, onBack }: { mode: ViewMode; onBack: () => void }) => {
  const { t } = useTranslation();

  const getContent = () => {
    switch (mode) {
      case "proposals":
        return { title: "PROPOSALS", Component: ProposalList };
      case "voting":
        return { title: "VOTING POWER", Component: VotingPower };
      case "stats":
        return { title: "STATISTICS", Component: DAOStats };
      case "join":
        return { title: "JOIN DAO", Component: JoinDAO };
      case "create":
        return { title: "CREATE PROPOSAL", Component: CreateProposal };
      default:
        return null;
    }
  };

  const content = getContent();
  if (!content) return null;

  const { title, Component } = content;

  return (
    <motion.div
      className="w-full max-w-5xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <motion.button
          onClick={onBack}
          className="px-4 py-2 border border-white/30 hover:border-white/60 bg-black/40 backdrop-blur-sm font-mono text-sm transition-all"
          whileHover={{ x: -4 }}
        >
          ← RETURN
        </motion.button>
        <div className="font-mono text-2xl tracking-wider text-white/90">{title}</div>
      </div>

      {/* Content Panel */}
      <div className="border border-white/20 bg-black/60 backdrop-blur-md p-8 cyberspace-panel cyberspace-content">
        <Component />
      </div>

      <style>{`
        .cyberspace-panel {
          box-shadow: 0 0 30px rgba(255, 255, 255, 0.05);
        }
        .cyberspace-panel:hover {
          box-shadow: 0 0 40px rgba(255, 255, 255, 0.1);
        }
        .clip-hexagon {
          clip-path: polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%);
        }

        /* Cyberspace Theme Overrides */
        .cyberspace-content * {
          color: white !important;
          border-color: rgba(255, 255, 255, 0.2) !important;
        }

        .cyberspace-content .border-border,
        .cyberspace-content .bg-card,
        .cyberspace-content .bg-muted,
        .cyberspace-content .bg-background {
          background-color: rgba(0, 0, 0, 0.4) !important;
          border-color: rgba(255, 255, 255, 0.15) !important;
        }

        .cyberspace-content input,
        .cyberspace-content textarea {
          background-color: rgba(0, 0, 0, 0.6) !important;
          border-color: rgba(255, 255, 255, 0.2) !important;
          color: white !important;
        }

        .cyberspace-content input::placeholder,
        .cyberspace-content textarea::placeholder {
          color: rgba(255, 255, 255, 0.3) !important;
        }

        .cyberspace-content button {
          background-color: rgba(255, 255, 255, 0.1) !important;
          border: 1px solid rgba(255, 255, 255, 0.3) !important;
          color: white !important;
          transition: all 0.2s !important;
        }

        .cyberspace-content button:hover:not(:disabled) {
          background-color: rgba(255, 255, 255, 0.2) !important;
          border-color: rgba(255, 255, 255, 0.6) !important;
          box-shadow: 0 0 20px rgba(255, 255, 255, 0.2) !important;
        }

        .cyberspace-content button:disabled {
          opacity: 0.3 !important;
          cursor: not-allowed !important;
        }

        .cyberspace-content .text-muted-foreground {
          color: rgba(255, 255, 255, 0.5) !important;
        }

        .cyberspace-content .text-green-400,
        .cyberspace-content .bg-green-500 {
          color: #00ff00 !important;
        }

        .cyberspace-content .text-red-400,
        .cyberspace-content .bg-red-500 {
          color: #ff0000 !important;
        }

        .cyberspace-content .bg-green-500 {
          background-color: #00ff00 !important;
        }

        .cyberspace-content .bg-red-500 {
          background-color: #ff0000 !important;
        }

        .cyberspace-content .text-blue-400 {
          color: #00ccff !important;
        }

        .cyberspace-content .text-yellow-400 {
          color: #ffff00 !important;
        }

        .cyberspace-content .bg-yellow-500\\/10 {
          background-color: rgba(255, 255, 0, 0.1) !important;
        }

        .cyberspace-content .border-yellow-500\\/20 {
          border-color: rgba(255, 255, 0, 0.2) !important;
        }

        /* Loading animation */
        .cyberspace-content .animate-pulse {
          animation: cyber-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;
        }

        @keyframes cyber-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        /* Scrollbar styling */
        .cyberspace-content ::-webkit-scrollbar {
          width: 8px;
        }

        .cyberspace-content ::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.3);
        }

        .cyberspace-content ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 4px;
        }

        .cyberspace-content ::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
      `}</style>
    </motion.div>
  );
};

// Grid Background
const GridBackground = () => {
  return (
    <div className="absolute inset-0">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          </pattern>
          <pattern id="grid-large" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 200 0 L 0 0 0 200" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <rect width="100%" height="100%" fill="url(#grid-large)" />
      </svg>

      {/* Animated gradient overlay */}
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-black/50 to-black" />
    </div>
  );
};

// Scanlines Effect
const Scanlines = () => {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="scanline absolute w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
};

// Vignette Overlay
const VignetteOverlay = () => {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-black/60" />
    </div>
  );
};

// Glitch Overlay
const GlitchOverlay = () => {
  const [showGlitch, setShowGlitch] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.95) {
        setShowGlitch(true);
        setTimeout(() => setShowGlitch(false), 100);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  if (!showGlitch) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-40">
      <div className="absolute inset-0 bg-white/5" style={{ mixBlendMode: "overlay" }} />
    </div>
  );
};
