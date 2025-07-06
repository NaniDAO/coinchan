import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useOperatorStatus } from "@/hooks/use-operator-status";
import { useSetOperatorApproval } from "@/hooks/use-zchef-contract";
import { ZChefAddress } from "@/constants/zChef";
import { TokenMeta } from "@/lib/coins";

interface ApprovalWorkflowProps {
  tokens: TokenMeta[];
  targetContract: `0x${string}`;
  onApprovalComplete?: () => void;
  className?: string;
}

export function ApprovalWorkflow({
  tokens,
  targetContract = ZChefAddress,
  onApprovalComplete,
  className,
}: ApprovalWorkflowProps) {
  const { t } = useTranslation();
  const { address } = useAccount();
  const [approvingTokens, setApprovingTokens] = useState<Set<bigint>>(new Set());

  const setOperatorApproval = useSetOperatorApproval();

  // Get operator status for all tokens
  const tokenApprovals = tokens.map((token) => ({
    token,
    isApproved:
      useOperatorStatus(
        token.source === "COOKBOOK" ? "cookbook" : "coins",
        address || "0x0000000000000000000000000000000000000000",
      ).data || false,
  }));

  const needsApproval = tokenApprovals.filter(({ isApproved }) => !isApproved);
  const allApproved = needsApproval.length === 0;

  useEffect(() => {
    if (allApproved && onApprovalComplete) {
      onApprovalComplete();
    }
  }, [allApproved, onApprovalComplete]);

  const handleApprove = async (token: TokenMeta) => {
    if (!token.id || !address) return;

    setApprovingTokens((prev) => new Set(prev).add(token.id!));

    try {
      await setOperatorApproval.mutateAsync({
        tokenId: token.id,
        operator: targetContract,
        approved: true,
      });
    } catch (error) {
      console.error(`Approval failed for ${token.symbol}:`, error);
    } finally {
      setApprovingTokens((prev) => {
        const newSet = new Set(prev);
        newSet.delete(token.id!);
        return newSet;
      });
    }
  };

  const handleApproveAll = async () => {
    if (!address) return;

    const tokensToApprove = needsApproval.map(({ token }) => token);

    for (const token of tokensToApprove) {
      if (token.id) {
        setApprovingTokens((prev) => new Set(prev).add(token.id!));
      }
    }

    try {
      await Promise.all(
        tokensToApprove.map((token) =>
          token.id
            ? setOperatorApproval.mutateAsync({
                tokenId: token.id,
                operator: targetContract,
                approved: true,
              })
            : Promise.resolve(),
        ),
      );
    } catch (error) {
      console.error("Batch approval failed:", error);
    } finally {
      setApprovingTokens(new Set());
    }
  };

  if (!address) {
    return (
      <div className={className}>
        <div className="text-center py-4 text-muted-foreground">{t("common.connect_wallet_to_continue")}</div>
      </div>
    );
  }

  if (allApproved) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 text-green-600">
          <Badge variant="default">✓</Badge>
          <span className="text-sm">{t("common.all_tokens_approved")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">{t("common.token_approvals_required")}</h4>
          <Badge variant="outline">
            {needsApproval.length} {t("common.pending")}
          </Badge>
        </div>

        <Separator />

        <div className="space-y-3">
          {tokenApprovals.map(({ token, isApproved }) => (
            <div key={token.id?.toString() || token.symbol} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {token.imageUrl && <img src={token.imageUrl} alt={token.symbol} className="w-5 h-5 rounded-full" />}
                <span className="font-medium">{token.symbol}</span>
                <span className="text-xs text-muted-foreground">
                  ({token.source === "COOKBOOK" ? "Cookbook" : "ZAMM"})
                </span>
              </div>

              <div className="flex items-center gap-2">
                {isApproved ? (
                  <Badge variant="default">✓ {t("common.approved")}</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleApprove(token)}
                    disabled={approvingTokens.has(token.id!) || setOperatorApproval.isPending}
                  >
                    {approvingTokens.has(token.id!) ? t("common.approving") : t("common.approve")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {needsApproval.length > 1 && (
          <>
            <Separator />
            <Button
              onClick={handleApproveAll}
              disabled={setOperatorApproval.isPending || approvingTokens.size > 0}
              className="w-full"
            >
              {approvingTokens.size > 0 || setOperatorApproval.isPending
                ? t("common.approving_all")
                : t("common.approve_all")}
            </Button>
          </>
        )}

        {/* Error Display */}
        {setOperatorApproval.error && (
          <div className="text-sm text-red-500 text-center">{setOperatorApproval.error.message}</div>
        )}
      </div>
    </div>
  );
}
