import { useTranslation } from "react-i18next";
import { useDAOProposalCount, useDAOProposalId } from "@/hooks/use-dao-proposals";
import { ProposalCard } from "./ProposalCard";
import { LoadingLogo } from "@/components/ui/loading-logo";

export const ProposalList = () => {
  const { t } = useTranslation();
  const { count, isLoading } = useDAOProposalCount();

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <LoadingLogo size="lg" />
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="border border-border rounded-lg p-8 text-center bg-card">
        <p className="text-muted-foreground">{t("dao.no_proposals")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, i) => count - 1 - i).map((index) => (
        <ProposalListItem key={index} index={index} />
      ))}
    </div>
  );
};

const ProposalListItem = ({ index }: { index: number }) => {
  const proposalId = useDAOProposalId({ index });

  if (!proposalId) {
    return null;
  }

  return <ProposalCard proposalId={proposalId} />;
};
