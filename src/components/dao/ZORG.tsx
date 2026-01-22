import { useNavigate } from "@tanstack/react-router";
import { RainbowConnectButton } from "@/components/RainbowConnectButton";
import { JoinDAO } from "./JoinDAO";
import {
  LabelBar,
  SystemPanel,
  StatusPills,
  CornerMarks,
  Timecode,
  SystemVersion,
} from "./vhs-ui";
import { useAccount, useReadContract } from "wagmi";
import { ZORG_SHARES, ZORG_SHARES_ABI } from "@/constants/ZORG";
import { formatEther } from "viem";
import { Loader2 } from "lucide-react";

export const ZORG = () => {
  const navigate = useNavigate();
  const { address } = useAccount();

  // Fetch ZORG shares balance for status display
  const { data: zorgSharesBalance, isLoading: isSharesLoading } = useReadContract({
    address: ZORG_SHARES,
    abi: ZORG_SHARES_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      staleTime: 30_000,
    },
  });

  // Fetch total supply
  const { data: totalSupply, isLoading: isTotalSupplyLoading } = useReadContract({
    address: ZORG_SHARES,
    abi: ZORG_SHARES_ABI,
    functionName: "totalSupply",
    query: {
      staleTime: 60_000,
    },
  });

  const formattedBalance = zorgSharesBalance ? formatEther(zorgSharesBalance) : "0";
  const formattedTotalSupply = totalSupply ? formatEther(totalSupply) : "—";
  const hasBalance = zorgSharesBalance && zorgSharesBalance > 0n;

  return (
    <div className="relative min-h-screen w-full bg-[#030303] text-white overflow-x-hidden">
      {/* ====== BACKGROUND LAYERS ====== */}

      {/* Animated noise drift layer */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          animation: "vhsNoiseDrift 22s linear infinite",
        }}
      />

      {/* Blueprint grid - major + minor */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.05]"
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, transparent, transparent 59px, rgba(26, 74, 74, 0.7) 59px, rgba(26, 74, 74, 0.7) 60px),
            repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(26, 74, 74, 0.7) 59px, rgba(26, 74, 74, 0.7) 60px),
            repeating-linear-gradient(0deg, transparent, transparent 14px, rgba(15, 51, 51, 0.4) 14px, rgba(15, 51, 51, 0.4) 15px),
            repeating-linear-gradient(90deg, transparent, transparent 14px, rgba(15, 51, 51, 0.4) 14px, rgba(15, 51, 51, 0.4) 15px)
          `,
          backgroundSize: "60px 60px, 60px 60px, 15px 15px, 15px 15px",
        }}
      />

      {/* Scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.012]"
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)`,
        }}
      />

      {/* Vignette */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, 0.5) 100%)",
        }}
      />

      {/* Corner registration marks */}
      <CornerMarks size={24} offset={16} color="rgba(80, 80, 80, 0.45)" />

      {/* ====== HEADER ====== */}
      <header className="fixed left-0 right-0 top-0 z-30 border-b border-cyan-900/25 bg-black/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Logo / Title */}
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            className="group flex items-center gap-3 transition-all hover:opacity-80"
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full animate-pulse"
                style={{ background: "#22d3ee", boxShadow: "0 0 8px #22d3ee" }}
              />
              <span
                style={{
                  fontFamily: "'Courier New', ui-monospace, monospace",
                  fontSize: "14px",
                  fontWeight: 700,
                  letterSpacing: "0.2em",
                  color: "#e5e5e5",
                }}
              >
                ZORG DAO
              </span>
            </div>
            <span
              className="hidden sm:inline-block"
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "9px",
                letterSpacing: "0.1em",
                color: "rgba(113, 113, 122, 0.7)",
                textTransform: "uppercase",
              }}
            >
              // DECENTRALIZED AUTONOMOUS ORGANIZATION
            </span>
          </button>

          {/* Wallet */}
          <div className="flex items-center gap-3">
            <RainbowConnectButton />
          </div>
        </div>
      </header>

      {/* ====== MAIN CONTENT ====== */}
      <main className="relative z-20 mx-auto max-w-2xl px-4 pb-28 pt-24 sm:px-6 sm:pt-28">
        {/* ====== HERO LABEL BAR ====== */}
        <div className="mb-6 sm:mb-8">
          <div className="relative mx-auto max-w-lg">
            {/* Chromatic aberration effect */}
            <div
              className="absolute inset-0"
              style={{
                background: "rgba(255, 80, 80, 0.025)",
                transform: "translateX(2px)",
                filter: "blur(0.5px)",
                borderRadius: "2px",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: "rgba(80, 80, 255, 0.025)",
                transform: "translateX(-2px)",
                filter: "blur(0.5px)",
                borderRadius: "2px",
              }}
            />

            <LabelBar
              level="LV.3"
              label="MEMBERSHIP"
              statusText="ACTIVE"
              statusColor="cyan"
              showPulse
            />

            {/* Title */}
            <div className="mt-3 text-center">
              <h1
                style={{
                  fontFamily: "'Courier New', ui-monospace, monospace",
                  fontSize: "clamp(22px, 5.5vw, 32px)",
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  textShadow: "0 0 24px rgba(34, 211, 238, 0.4)",
                  color: "#f5f5f5",
                }}
              >
                JOIN THE DAO
              </h1>
              <p
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "10px",
                  letterSpacing: "0.12em",
                  color: "rgba(148, 163, 184, 0.65)",
                  textTransform: "uppercase",
                  marginTop: "4px",
                }}
              >
                // ACQUIRE GOVERNANCE SHARES
              </p>
            </div>
          </div>
        </div>

        {/* ====== ACTION PANEL (JoinDAO) ====== */}
        <div
          className="relative overflow-hidden border border-neutral-800/60"
          style={{
            background: "linear-gradient(180deg, rgba(10,10,10,0.95) 0%, rgba(5,5,5,0.98) 100%)",
            borderRadius: "3px",
          }}
        >
          {/* Inner grid pattern */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage: `
                repeating-linear-gradient(0deg, transparent, transparent 29px, rgba(42, 85, 85, 0.6) 29px, rgba(42, 85, 85, 0.6) 30px),
                repeating-linear-gradient(90deg, transparent, transparent 29px, rgba(42, 85, 85, 0.6) 29px, rgba(42, 85, 85, 0.6) 30px)
              `,
              backgroundSize: "30px 30px",
            }}
          />

          <JoinDAO />
        </div>

        {/* ====== SYSTEM STATUS PANEL ====== */}
        <div className="mt-6 sm:mt-8">
          <SystemPanel title="SYSTEM STATUS" level="SYS.1">
            <StatusPills
              pills={[
                {
                  label: "NETWORK",
                  value: "ETH MAINNET",
                  color: "green",
                },
                {
                  label: "CHAIN ID",
                  value: "1",
                  color: "neutral",
                },
                {
                  label: "YOUR SHARES",
                  value: address ? (
                    isSharesLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : hasBalance ? (
                      <span className="text-cyan-400">{Number(formattedBalance).toFixed(2)}</span>
                    ) : (
                      "0"
                    )
                  ) : (
                    "—"
                  ),
                  color: hasBalance ? "cyan" : "neutral",
                },
                {
                  label: "TOTAL SUPPLY",
                  value: isTotalSupplyLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    Number(formattedTotalSupply).toLocaleString(undefined, { maximumFractionDigits: 0 })
                  ),
                  color: "neutral",
                },
              ]}
            />
          </SystemPanel>
        </div>

        {/* ====== INFO CARDS ====== */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* Governance link */}
          <a
            href="https://majeurdao.eth.limo/#/dao/1/0x5E58BA0e06ED0F5558f83bE732a4b899a674053E"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative overflow-hidden border border-neutral-800/50 p-4 transition-all hover:border-cyan-700/40 sm:p-5"
            style={{
              background: "linear-gradient(180deg, rgba(10,10,10,0.9) 0%, rgba(5,5,5,0.95) 100%)",
              borderRadius: "2px",
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <div
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "8px",
                    letterSpacing: "0.08em",
                    color: "rgba(113, 113, 122, 0.7)",
                    textTransform: "uppercase",
                  }}
                >
                  LV.4 / EXTERNAL
                </div>
                <div
                  className="mt-2"
                  style={{
                    fontFamily: "'Courier New', ui-monospace, monospace",
                    fontSize: "14px",
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    color: "#e5e5e5",
                    textTransform: "uppercase",
                  }}
                >
                  GOVERNANCE
                </div>
                <div
                  className="mt-1"
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "10px",
                    color: "rgba(148, 163, 184, 0.6)",
                  }}
                >
                  View and vote on proposals
                </div>
              </div>
              <div
                className="transition-transform group-hover:translate-x-1"
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "16px",
                  color: "#22d3ee",
                }}
              >
                →
              </div>
            </div>
          </a>

          {/* Contract info */}
          <div
            className="relative overflow-hidden border border-neutral-800/50 p-4 sm:p-5"
            style={{
              background: "linear-gradient(180deg, rgba(10,10,10,0.9) 0%, rgba(5,5,5,0.95) 100%)",
              borderRadius: "2px",
            }}
          >
            <div
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "8px",
                letterSpacing: "0.08em",
                color: "rgba(113, 113, 122, 0.7)",
                textTransform: "uppercase",
              }}
            >
              LV.1 / SYSTEM INFO
            </div>
            <div
              className="mt-2"
              style={{
                fontFamily: "'Courier New', ui-monospace, monospace",
                fontSize: "14px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: "#e5e5e5",
                textTransform: "uppercase",
              }}
            >
              ETHEREUM MAINNET
            </div>
            <div
              className="mt-1"
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "10px",
                color: "rgba(148, 163, 184, 0.6)",
              }}
            >
              Chain ID: 1
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "#22c55e", boxShadow: "0 0 4px #22c55e" }}
              />
              <span
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "9px",
                  color: "#22c55e",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                OPERATIONAL
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* ====== FOOTER STATUS BAR ====== */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 border-t border-neutral-800/40 bg-black/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "#22c55e", boxShadow: "0 0 4px #22c55e" }}
              />
              <span
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "9px",
                  letterSpacing: "0.04em",
                  color: "#22c55e",
                  textTransform: "uppercase",
                }}
              >
                ONLINE
              </span>
            </div>
            <span
              className="hidden sm:inline-block"
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "9px",
                letterSpacing: "0.03em",
                color: "rgba(113, 113, 122, 0.7)",
                textTransform: "uppercase",
              }}
            >
              NETWORK: ETH MAINNET
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Timecode prefix="REC" className="hidden sm:flex" />
            <SystemVersion />
          </div>
        </div>
      </footer>

      {/* ====== GLOBAL KEYFRAME ANIMATIONS ====== */}
      <style>{`
        @keyframes vhsNoiseDrift {
          0% { transform: translate(0, 0); }
          25% { transform: translate(-2%, -1%); }
          50% { transform: translate(-3%, -2%); }
          75% { transform: translate(-1%, -1%); }
          100% { transform: translate(0, 0); }
        }

        @media (prefers-reduced-motion: reduce) {
          @keyframes vhsNoiseDrift {
            0%, 100% { transform: translate(0, 0); }
          }
        }
      `}</style>
    </div>
  );
};
