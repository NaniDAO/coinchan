import { motion } from "framer-motion";
import { ProposalList } from "./ProposalList";
import { VotingPower } from "./VotingPower";
import { DAOStats } from "./DAOStats";
import { JoinDAO } from "./JoinDAO";
import { CreateProposal } from "./CreateProposal";
import { TreasuryView } from "./TreasuryView";
import { GovernanceInfo } from "./GovernanceInfo";
import { MembershipView } from "./MembershipView";
import type { ViewMode } from "./VoidView";
import { cn } from "@/lib/utils";

interface ContentViewProps {
    mode: ViewMode;
    onBack: () => void;
    className?: string;
}

export const ContentView = ({ mode, onBack, className }: ContentViewProps) => {
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
            case "treasury":
                return { title: "TREASURY", Component: TreasuryView };
            case "governance":
                return { title: "GOVERNANCE", Component: GovernanceInfo };
            case "membership":
                return { title: "MEMBERSHIP", Component: MembershipView };
            default:
                return null;
        }
    };

    const content = getContent();
    if (!content) return null;

    const { title, Component } = content;

    return (
        <motion.div
            className="w-full max-w-5xl h-fit flex flex-col"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
        >
            {/* Header - Fixed */}
            <div className="flex items-center gap-2 sm:gap-4 mb-4 sm:mb-6 flex-shrink-0">
                <motion.button
                    onClick={onBack}
                    className="px-3 py-1.5 sm:px-4 sm:py-2 border border-border/30 hover:border-border/60 bg-background/40 backdrop-blur-sm font-mono text-xs sm:text-sm transition-all"
                    whileHover={{ x: -4 }}
                >
                    ← RETURN
                </motion.button>
                <div className="border border-border/30 hover:border-border/60 bg-background/40 font-mono text-xs sm:text-sm tracking-wider px-3 py-1.5 sm:px-4 sm:py-2">
                    {title}
                </div>
            </div>

            {/* Content Panel - Scrollable */}
            <div
                className={cn(
                    "border border-border/20 bg-background/60 backdrop-blur-md p-4 sm:p-8 cyberspace-content overflow-y-auto flex-1 max-h-[calc(100vh-180px)] sm:max-h-[calc(100vh-200px)]",
                    className,
                )}
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

        /* Scrollbar styling */
        .cyberspace-content ::-webkit-scrollbar {
          width: 8px;
        }

        .cyberspace-content ::-webkit-scrollbar-track {
          background: hsl(var(--muted) / 0.3);
        }

        .cyberspace-content ::-webkit-scrollbar-thumb {
          background: hsl(var(--muted-foreground) / 0.3);
          border-radius: 4px;
        }

        .cyberspace-content ::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--muted-foreground) / 0.5);
        }
      `}</style>
        </motion.div>
    );
};
