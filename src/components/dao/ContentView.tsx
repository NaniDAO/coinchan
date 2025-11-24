import { motion } from "framer-motion";
import { ProposalList } from "./ProposalList";
import { VotingPower } from "./VotingPower";
import { DAOStats } from "./DAOStats";
import { JoinDAO } from "./JoinDAO";
import { CreateProposal } from "./CreateProposal";
import type { ViewMode } from "./VoidView";

interface ContentViewProps {
    mode: ViewMode;
    onBack: () => void;
}

export const ContentView = ({ mode, onBack }: ContentViewProps) => {
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
            className="w-full max-w-5xl h-full flex flex-col"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            {/* Header - Fixed */}
            <div className="flex items-center gap-4 mb-6 flex-shrink-0">
                <motion.button
                    onClick={onBack}
                    className="px-4 py-2 border border-white/30 hover:border-white/60 bg-black/40 backdrop-blur-sm font-mono text-sm transition-all"
                    whileHover={{ x: -4 }}
                >
                    ← RETURN
                </motion.button>
                <div className="border border-white/30 hover:border-white/60 bg-black/40 font-mono text-sm tracking-wider px-4 py-2">
                    {title}
                </div>
            </div>

            {/* Content Panel - Scrollable */}
            <div
                className="border border-white/20 bg-black/60 backdrop-blur-md p-8 cyberspace-content overflow-y-auto flex-1 max-h-[calc(100vh-200px)]"
                style={{
                    scrollBehavior: "smooth",
                    boxShadow: "0 0 30px rgba(255, 255, 255, 0.05)",
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow =
                        "0 0 40px rgba(255, 255, 255, 0.1)";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow =
                        "0 0 30px rgba(255, 255, 255, 0.05)";
                }}
            >
                <Component />
            </div>

            <style>{`
        /* Hexagon clip path for navigation nodes */
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
