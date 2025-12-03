import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Binary } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { VoidView, type ViewMode } from "./VoidView";
import { ContentView } from "./ContentView";
// import { ChaosVoidSystem } from "./chaos/ChaosVoidSystem";

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
        <div
            className="fixed h-screen w-screen inset-0 z-40 bg-black text-white overflow-hidden relative"
            style={{
                filter: "contrast(1.4) brightness(1.2) saturate(1.5)",
            }}
        >
            {/* CHAOS VOID SYSTEM - Multi-layer Canvas */}
            {/* <ChaosVoidSystem />*/}

            {/* Entry Animation with Warning */}
            <AnimatePresence>
                {isEntering && (
                    <motion.div
                        className="absolute inset-0 z-50 flex items-center justify-center bg-black"
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1, delay: 1 }}
                    >
                        <motion.div
                            className="text-center max-w-2xl px-8"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.2 }}
                            transition={{ duration: 0.8 }}
                        >
                            {/* Epilepsy Warning */}
                            <motion.div
                                className="mb-6 p-4 border border-red-500/50 bg-red-500/10"
                                animate={{
                                    borderColor: [
                                        "rgba(239, 68, 68, 0.5)",
                                        "rgba(239, 68, 68, 1)",
                                        "rgba(239, 68, 68, 0.5)",
                                    ],
                                }}
                                transition={{
                                    duration: 2,
                                    repeat: Number.POSITIVE_INFINITY,
                                }}
                            >
                                <div className="font-mono text-red-400 text-xs mb-1">
                                    ⚠ WARNING
                                </div>
                                <div className="font-mono text-red-300 text-sm">
                                    PHOTOSENSITIVE SEIZURE WARNING
                                </div>
                            </motion.div>

                            <Binary className="w-20 h-20 mx-auto mb-4 text-white animate-pulse" />
                            <motion.div
                                className="font-mono text-2xl tracking-wider text-white"
                                animate={{
                                    x: [0, -2, 2, -2, 0],
                                    textShadow: [
                                        "0 0 0px #fff",
                                        "-2px 0 10px #ff0000, 2px 0 10px #00ffff",
                                        "0 0 0px #fff",
                                    ],
                                }}
                                transition={{
                                    duration: 0.3,
                                    repeat: Number.POSITIVE_INFINITY,
                                    repeatDelay: 2,
                                }}
                            >
                                ENTERING ZORG CYBERSPACE
                            </motion.div>
                            <div className="font-mono text-sm text-gray-400 mt-2">
                                [ INITIALIZING NEURAL INTERFACE ]
                            </div>
                            <div className="font-mono text-xs text-green-400 mt-4 animate-pulse">
                                &gt;&gt; CONNECTION ESTABLISHED
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
                    <ContentView
                        mode={viewMode}
                        onBack={() => setViewMode("void")}
                    />
                )}
            </div>

            {/* Status Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-black/60 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-4">
                        <span className="text-green-400">◉ ONLINE</span>
                        <span className="text-gray-400">
                            NETWORK: ETHEREUM MAINNET
                        </span>
                    </div>
                    <div className="text-gray-400">
                        ZORG DAO v1.0 • {new Date().toISOString().split("T")[0]}
                    </div>
                </div>
            </div>
        </div>
    );
};
