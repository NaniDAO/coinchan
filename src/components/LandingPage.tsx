import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLandingData } from "../hooks/use-landing-data";
import { useNavigate } from "@tanstack/react-router";
import { SortedTrendingFarms } from "./SortedTrendingFarms";
import { GovernanceProposals } from "./GovernanceProposals";
import { InstantTradeAction } from "./trade/InstantTradeAction";
import { InstantTradeActionSkeleton } from "./trade/InstantTradeActionSkeleton";
import { ErrorBoundary } from "./ErrorBoundary";

interface LandingPageProps {
    onEnterApp?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: landingData } = useLandingData();

    const [terminalLines, setTerminalLines] = useState<string[]>([]);
    const [systemReady, setSystemReady] = useState(false);

    // Terminal boot animation
    useEffect(() => {
        setTerminalLines([]);

        const lines = [
            t("landing.initializing"),
            t("landing.connecting_chains"),
            t("landing.loading_data"),
            t("landing.system_ready"),
        ];

        let currentLine = 0;
        const typeInterval = setInterval(() => {
            if (currentLine < lines.length) {
                setTerminalLines((prev) => {
                    if (!prev.includes(lines[currentLine])) {
                        return [...prev, lines[currentLine]];
                    }
                    return prev;
                });
                currentLine++;
                if (currentLine === lines.length) {
                    setSystemReady(true);
                }
            } else {
                clearInterval(typeInterval);
            }
        }, 600);

        return () => clearInterval(typeInterval);
    }, [t]);

    const handleEnterApp = () => {
        if (onEnterApp) {
            onEnterApp();
        }
    };

    return (
        <div className="m-0 p-0">
            {/* Retro grid background - Full viewport, non-interactive */}
            <div
                className="fixed inset-0 w-screen h-screen m-0 p-0 retro-grid pointer-events-none"
                style={{ zIndex: -10 }}
            />

            <div className="relative min-h-screen w-full">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20 lg:flex lg:gap-16 items-start">
                    {/* Left Sidebar - Hidden on mobile */}
                    <div className="hidden lg:block w-1/3 pt-10 sticky top-24 self-start">
                        <div className="font-mono text-xs sm:text-sm space-y-6 text-muted-foreground">
                            {/* Title */}
                            <div className="text-3xl font-black text-foreground tracking-tighter mb-6 font-sans">
                                ZAMM DEFI
                            </div>

                            {/* Terminal Boot Lines */}
                            <div className="space-y-1 text-green-600 dark:text-green-400">
                                {terminalLines.map((line, index) => (
                                    <p key={index}>{line}</p>
                                ))}
                            </div>

                            {/* Status and Progress */}
                            {systemReady && (
                                <div className="pt-4 border-l-2 border-primary pl-4">
                                    <p className="mb-2">
                                        Cheapest Ethereum Exchange{" "}
                                        <span className="cursor-blink">_</span>
                                    </p>
                                    <div className="flex items-center gap-2 text-xs">
                                        <span>{t("landing.load")}:</span>
                                        <div className="h-2 w-24 bg-muted rounded-full overflow-hidden">
                                            <div className="h-full bg-primary w-full" />
                                        </div>
                                        <span>100%</span>
                                    </div>
                                </div>
                            )}

                            {/* Compact Stats */}
                            <div className="space-y-1 font-bold">
                                <div className="flex justify-between w-48">
                                    <span>eth</span>
                                    <span>
                                        {landingData?.ethPrice || "loading..."}
                                    </span>
                                </div>
                                <div className="flex justify-between w-48">
                                    <span>{t("landing.gas")}</span>
                                    <span>
                                        {landingData?.gasPrice || "loading..."}
                                    </span>
                                </div>
                                <div className="flex justify-between w-48">
                                    <span>{t("landing.create")}</span>
                                    <span>
                                        {landingData?.createCost ||
                                            "loading..."}
                                    </span>
                                </div>
                            </div>

                            {/* Predictions */}
                            <div className="pt-6">
                                <h3 className="font-bold text-foreground mb-3 text-base">
                                    {t("landing.predictions")}:
                                </h3>
                                <div className="space-y-2 border-l border-border ml-1 pl-3 relative">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                navigate({ to: "/predict" })
                                            }
                                            className="flex items-center gap-2 hover:bg-accent p-1 rounded transition"
                                        >
                                            <span className="font-bold text-foreground">
                                                Onchain Events
                                            </span>
                                            <span className="opacity-50 text-[10px]">
                                                (View all)
                                            </span>
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2 group cursor-pointer hover:bg-accent p-1 rounded transition">
                                        <a
                                            href="https://ethpm.eth.limo/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2"
                                        >
                                            <div className="w-4 h-4 bg-pink-500 rounded-sm" />
                                            <span className="font-bold text-foreground">
                                                PnkPM
                                            </span>
                                            <span className="opacity-50 text-[10px]">
                                                (PAMM Market)
                                            </span>
                                        </a>
                                    </div>
                                    <div className="flex items-center gap-2 group cursor-pointer hover:bg-accent p-1 rounded transition">
                                        <a
                                            href="https://ethpm.eth.limo/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2"
                                        >
                                            <div className="w-4 h-4 bg-green-500 rounded-sm" />
                                            <span className="font-bold text-foreground">
                                                GasPM
                                            </span>
                                            <span className="opacity-50 text-[10px]">
                                                (PAMM Market)
                                            </span>
                                        </a>
                                    </div>
                                </div>
                            </div>

                            {/* Trending Farms */}
                            <div className="pt-6">
                                <h3 className="font-bold text-foreground mb-3 text-base">
                                    {t("landing.trending")}:
                                </h3>
                                <SortedTrendingFarms />
                            </div>

                            {/* Governance */}
                            <div className="pt-6">
                                <h3 className="font-bold text-foreground mb-3 text-base">
                                    {t("landing.governance")}:
                                </h3>
                                <GovernanceProposals />
                            </div>

                            {/* Enter Button */}
                            <div className="pt-8">
                                <button
                                    onClick={handleEnterApp}
                                    className="w-full border-2 border-primary bg-primary/20 hover:bg-primary/40 text-primary dark:text-primary font-bold py-2 px-4 uppercase tracking-wider text-xs transition-colors"
                                >
                                    Enter ZAMM _
                                </button>
                            </div>

                            {/* Social Links - Below CTA */}
                            <div className="pt-3 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                                <a
                                    href="https://github.com/zammdefi"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-foreground transition-colors"
                                >
                                    View source on GitHub
                                </a>
                                <span>·</span>
                                <a
                                    href="https://x.com/zamm_defi"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-foreground transition-colors"
                                >
                                    Follow updates on X
                                </a>
                            </div>

                            {/* Features */}
                            <div className="pt-4 text-[10px] uppercase tracking-widest opacity-40">
                                EVM Prague • Fair Launches • Cheap Fees
                            </div>
                        </div>
                    </div>

                    {/* Right Main Content */}
                    <div className="w-full lg:w-2/3 space-y-12">
                        {/* Swap Interface */}
                        <div className="max-w-xl mx-auto lg:mx-0">
                            <ErrorBoundary fallback={<InstantTradeActionSkeleton />}>
                                <InstantTradeAction />
                            </ErrorBoundary>
                        </div>

                        <div className="h-12" />

                        {/* What is ZAMM Section */}
                        <section className="max-w-2xl mx-auto lg:mx-0 relative">
                            <div className="absolute -left-4 top-0 w-1 h-full bg-gradient-to-b from-primary via-transparent to-transparent hidden sm:block" />
                            <div className="mb-8 flex items-center gap-4">
                                <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-foreground">
                                    Cheapest Ethereum DEX &{" "}
                                    <span className="text-primary underline decoration-4 underline-offset-4 decoration-foreground">
                                        DAICO
                                    </span>{" "}
                                    Launchpad
                                </h1>
                                <span className="px-2 py-1 bg-foreground text-background text-xs font-mono rounded">
                                    v2.0
                                </span>
                            </div>
                            <div className="prose prose-lg dark:prose-invert text-muted-foreground font-sans leading-relaxed">
                                <p className="mb-4 first-letter:text-5xl first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:text-primary">
                                    ZAMM is the cheapest decentralized exchange
                                    on Ethereum with a built-in DAICO launchpad.
                                    It enables{" "}
                                    <span className="text-foreground font-semibold border-b-2 border-primary/30">
                                        gas-optimized on-chain trading
                                    </span>{" "}
                                    and permissionless token launches using a
                                    next-generation market maker.
                                </p>
                                <p className="mb-6 text-base">
                                    DAICOs on ZAMM allow projects to raise funds
                                    and create liquidity simultaneously, fully
                                    on-chain.
                                </p>
                                <div className="bg-card border-l-4 border-primary p-6 rounded-r-lg my-8 shadow-sm">
                                    <h4 className="font-bold text-foreground font-mono text-sm uppercase tracking-wide mb-2 flex items-center gap-2">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="w-5 h-5 text-primary"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                                            />
                                        </svg>
                                        Permissionless Architecture
                                    </h4>
                                    <p className="text-base m-0">
                                        Unlike traditional launchpads, ZAMM
                                        enforces{" "}
                                        <span className="font-bold text-foreground">
                                            zero custody
                                        </span>
                                        , no whitelisting, and absolutely no
                                        off-chain processes. It puts the power
                                        back into the hands of the community,
                                        ensuring true decentralization and
                                        transparency from day one.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mt-8 font-mono text-sm">
                                    <div className="flex items-center gap-3 p-3 border border-dashed border-border rounded-lg">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="w-5 h-5 text-primary"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M13 10V3L4 14h7v7l9-11h-7z"
                                            />
                                        </svg>
                                        <span>Fair Launch DAICOs</span>
                                    </div>
                                    <div className="flex items-center gap-3 p-3 border border-dashed border-border rounded-lg">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="w-5 h-5 text-primary"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M13 10V3L4 14h7v7l9-11h-7z"
                                            />
                                        </svg>
                                        <span>Ultra Low Gas Costs</span>
                                    </div>
                                    <div className="flex items-center gap-3 p-3 border border-dashed border-border rounded-lg">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="w-5 h-5 text-primary"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                                            />
                                        </svg>
                                        <span>No Whitelist</span>
                                    </div>
                                    <div className="flex items-center gap-3 p-3 border border-dashed border-border rounded-lg">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="w-5 h-5 text-primary"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                            />
                                        </svg>
                                        <span>Non-Custodial by Design</span>
                                    </div>
                                </div>

                                {/* Additional SEO paragraph */}
                                <p className="mt-8 text-base">
                                    ZAMM is designed for developers, traders,
                                    and communities who want to launch and trade
                                    tokens directly on Ethereum mainnet without
                                    relying on centralized launchpads or
                                    expensive AMMs.
                                </p>
                            </div>
                        </section>

                        <div className="h-20" />
                    </div>
                </div>

                {/* Footer */}
                <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-border mt-20">
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground max-w-2xl">
                            ZAMM is a decentralized exchange and DAICO launch
                            protocol on Ethereum mainnet.
                        </p>
                        <div className="flex flex-wrap gap-6 text-sm">
                            <a
                                href="https://github.com/zammdefi"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                GitHub
                            </a>
                            <span className="text-muted-foreground">·</span>
                            <a
                                href="https://x.com/zamm_defi"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Twitter/X
                            </a>
                            <span className="text-muted-foreground">·</span>
                            <a
                                href="https://docs.zamm.eth.limo/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Docs
                            </a>
                            <span className="text-muted-foreground">·</span>
                            <button
                                type="button"
                                onClick={() => navigate({ to: "/swap" })}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                App
                            </button>
                        </div>
                    </div>
                </footer>

                {/* Mobile Bottom Navigation */}
                <div className="fixed bottom-0 left-0 w-full bg-card border-t border-border p-4 lg:hidden z-50">
                    <div className="flex justify-around items-center font-mono text-xs">
                        <button
                            type="button"
                            onClick={() => navigate({ to: "/swap" })}
                            className="flex flex-col items-center gap-1 text-primary"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-6 h-6"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                                />
                            </svg>
                            <span>Trade</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate({ to: "/explore" })}
                            className="flex flex-col items-center gap-1 opacity-50"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-6 h-6"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <span>Explore</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate({ to: "/positions" })}
                            className="flex flex-col items-center gap-1 opacity-50"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-6 h-6"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
                                />
                            </svg>
                            <span>Pool</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate({ to: "/farm" })}
                            className="flex flex-col items-center gap-1 opacity-50"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-6 h-6"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                                />
                            </svg>
                            <span>Farm</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LandingPage;
