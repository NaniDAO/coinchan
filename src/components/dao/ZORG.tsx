import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Binary } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { VoidView, type ViewMode } from "./VoidView";
import { ContentView } from "./ContentView";

export const ZORG = () => {
    const navigate = useNavigate();

    const handleExit = () => {
        navigate({ to: "/" });
    };

    return (
        <div
            className="h-screen w-screen inset-0 z-40 bg-black text-white overflow-hidden relative"
            style={{
                filter: "contrast(1.4) brightness(1.2) saturate(1.5)",
            }}
        >
            {/* Tiled Background GIF */}
            <div
                className="absolute inset-0 z-0 opacity-60"
                style={{
                    backgroundImage: "url(/zorg-bg.gif)",
                    backgroundRepeat: "repeat",
                    backgroundSize: "auto",
                }}
            />

            {/* Main Content */}
            <div className="relative z-10 h-full flex items-center justify-center p-8">
                <ContentView mode={"join"} onBack={handleExit} />
            </div>

            {/* Status Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-black/60 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-4">
                        <span className="text-green-400">◉ ONLINE</span>
                        <span className="text-gray-400">
                            NETWORK: ETHEREUM MAINNET
                        </span>
                        <a
                            href="https://majeurdao.eth.limo/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:text-cyan-300 transition-colors underline"
                        >
                            GOVERN
                        </a>
                    </div>
                    <div className="text-gray-400">
                        ZORG DAO v1.0 • {new Date().toISOString().split("T")[0]}
                    </div>
                </div>
            </div>
        </div>
    );
};
