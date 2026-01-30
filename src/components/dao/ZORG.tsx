import { useNavigate } from "@tanstack/react-router";
import { RainbowConnectButton } from "@/components/RainbowConnectButton";
import { JoinDAO } from "./JoinDAO";
import { RageQuit } from "./RageQuit";
import { DAOChat } from "./DAOChat";
import { ProposalList } from "./ProposalList";
import { useAccount, useReadContract } from "wagmi";
import { ZORG_SHARES, ZORG_SHARES_ABI } from "@/constants/ZORG";
import { formatEther } from "viem";
import { Loader2, ArrowLeft, Vote } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";

type ZORGProps = {
  isFullscreenChat?: boolean;
};

export const ZORG = ({ isFullscreenChat = false }: ZORGProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { address } = useAccount();
  const [showProposals, setShowProposals] = useState(false);

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

  const formattedBalance = zorgSharesBalance ? Number(formatEther(zorgSharesBalance)).toFixed(2) : "0";
  const formattedTotalSupply = totalSupply
    ? Number(formatEther(totalSupply)).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "—";
  const hasBalance = zorgSharesBalance && zorgSharesBalance > 0n;

  const handleToggleFullscreen = (fullscreen: boolean) => {
    navigate({
      to: "/dao",
      search: fullscreen ? { chat: "fullscreen" } : {},
      replace: true,
    });
  };

  // Fullscreen chat view
  if (isFullscreenChat) {
    return (
      <div className="min-h-screen w-full bg-background flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <button
              type="button"
              onClick={() => handleToggleFullscreen(false)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="font-mono text-sm font-semibold tracking-wide">zOrg Chat</span>
            </button>
            <RainbowConnectButton />
          </div>
        </header>

        {/* Fullscreen Chat */}
        <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-4">
          <DAOChat isFullscreen onToggleFullscreen={handleToggleFullscreen} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="font-mono text-sm font-semibold tracking-wide">ZAMM DEX</span>
          </button>
          <RainbowConnectButton />
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-2xl px-4 py-8">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Join the zOrg</h1>
          <p className="text-muted-foreground text-sm mt-1">Acquire governance shares with ETH or ZAMM</p>
          <p className="text-muted-foreground text-xs mt-1">Top 256 ZORG holders can mint a free zOrgz NFT</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="border rounded-lg p-4 bg-card">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Your Shares</div>
            <div className="font-mono text-lg font-semibold">
              {address ? (
                isSharesLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : hasBalance ? (
                  <span className="text-primary">{formattedBalance}</span>
                ) : (
                  "0"
                )
              ) : (
                "—"
              )}
            </div>
          </div>
          <div className="border rounded-lg p-4 bg-card">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Supply (ZAMM staked)</div>
            <div className="font-mono text-lg font-semibold">
              {isTotalSupplyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : formattedTotalSupply}
            </div>
          </div>
        </div>

        {/* Join DAO Panel */}
        <div className="border rounded-lg bg-card">
          <JoinDAO />
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <RageQuit />
          </div>
        </div>

        {/* DAO Chat */}
        <div className="mt-6">
          <DAOChat onToggleFullscreen={handleToggleFullscreen} />
        </div>

        {/* Governance Section */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowProposals(!showProposals)}
            className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent transition-colors w-full text-left"
          >
            <div className="flex items-center gap-3">
              <Vote className="h-5 w-5 text-primary" />
              <div>
                <div className="font-medium">{t("dao.governance") || "Governance"}</div>
                <div className="text-sm text-muted-foreground">
                  {t("dao.view_and_vote") || "View and vote on proposals"}
                </div>
              </div>
            </div>
            <span className={`transition-transform ${showProposals ? "rotate-180" : ""}`}>▼</span>
          </button>

          {showProposals && (
            <div className="mt-4 space-y-4">
              <ProposalList />
            </div>
          )}
        </div>

        {/* Network Info */}
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          <span>Ethereum Mainnet</span>
        </div>
      </main>
    </div>
  );
};
