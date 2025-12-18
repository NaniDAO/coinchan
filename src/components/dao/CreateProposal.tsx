import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI } from "@/constants/ZORG";
import { useDAOVotingPower } from "@/hooks/use-dao-voting-power";
import { useDAOStats } from "@/hooks/use-dao-stats";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const CreateProposal = () => {
  const { t } = useTranslation();
  const { address } = useAccount();
  const { votingPower } = useDAOVotingPower({ address });
  const { proposalThreshold } = useDAOStats();

  const [targetAddress, setTargetAddress] = useState("");
  const [value, setValue] = useState("");
  const [calldata, setCalldata] = useState("");

  const { writeContract, data: hash } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const canPropose = votingPower >= proposalThreshold;

  const handleOpenProposal = () => {
    if (!targetAddress) {
      toast.error(t("dao.enter_target_address"));
      return;
    }

    writeContract(
      {
        address: ZORG_ADDRESS,
        abi: ZORG_ABI,
        functionName: "openProposal",
        args: [
          BigInt(0), // Placeholder proposal ID - in real impl, compute the ID first
        ],
      },
      {
        onSuccess: () => {
          toast.success(t("dao.proposal_created"));
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  };

  return (
    <div className="border border-border rounded-lg p-6 bg-card">
      <h3 className="text-lg font-semibold mb-4">{t("dao.create_proposal")}</h3>

      {!canPropose && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm text-yellow-400">
          {t("dao.insufficient_voting_power")} ({t("dao.need")}: {proposalThreshold.toString()}, {t("dao.have")}:{" "}
          {votingPower.toString()})
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">{t("dao.target_address")}</label>
          <input
            type="text"
            value={targetAddress}
            onChange={(e) => setTargetAddress(e.target.value)}
            placeholder="0x..."
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono"
            disabled={!canPropose}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">{t("dao.value_eth")}</label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono"
            disabled={!canPropose}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">{t("dao.calldata_optional")}</label>
          <textarea
            value={calldata}
            onChange={(e) => setCalldata(e.target.value)}
            placeholder="0x"
            rows={3}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono resize-none"
            disabled={!canPropose}
          />
        </div>

        <Button onClick={handleOpenProposal} disabled={!canPropose || isConfirming || !address} className="w-full">
          {!address ? t("common.connect_wallet") : t("dao.create_proposal")}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-4">{t("dao.create_proposal_note")}</p>
    </div>
  );
};
