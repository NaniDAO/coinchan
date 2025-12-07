import { motion } from "framer-motion";

export const MenuView = () => {
    return (
        <motion.div
            className="w-full max-w-2xl h-lg flex flex-col"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
        >
            {/* Header */}
            <div className="flex items-center gap-2 sm:gap-4 mb-4 sm:mb-6 flex-shrink-0">
                <div className="border border-border/30 hover:border-border/60 bg-background/40 font-mono text-xs sm:text-sm tracking-wider px-3 py-1.5 sm:px-4 sm:py-2">
                    INFO
                </div>
            </div>

            {/* Content Panel */}
            <div
                className="border border-border/20 bg-background/60 backdrop-blur-md p-4 sm:p-6 overflow-y-auto flex-1"
                style={{
                    scrollBehavior: "smooth",
                    boxShadow: "0 0 30px rgba(255, 255, 255, 0.05)",
                }}
            >
                <div className="space-y-4">
                    <h2 className="text-lg sm:text-xl font-bold font-mono tracking-wider">
                        ZORG DAO
                    </h2>

                    <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                        <p>
                            Welcome to the ZORG DAO interface - a decentralized
                            autonomous organization built on Ethereum mainnet.
                        </p>

                        <p>
                            This is a governance platform where members can
                            propose, vote on, and execute decisions collectively
                            through smart contracts.
                        </p>

                        <div className="pt-2 border-t border-border/20">
                            <h3 className="font-semibold text-foreground mb-2">
                                Key Features:
                            </h3>
                            <ul className="space-y-1 list-disc list-inside">
                                <li>Join the DAO by purchasing shares</li>
                                <li>Create and vote on proposals</li>
                                <li>Delegate voting power</li>
                                <li>View treasury assets</li>
                                <li>Track governance parameters</li>
                            </ul>
                        </div>

                        <div className="pt-2 border-t border-border/20">
                            <h3 className="font-semibold text-foreground mb-2">
                                Getting Started:
                            </h3>
                            <p>
                                Connect your wallet and join the DAO to
                                participate in governance. Shares grant voting
                                rights, while loot represents economic ownership
                                without voting power.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
