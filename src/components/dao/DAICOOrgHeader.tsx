import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ExternalLink, Coins } from "lucide-react";
import { formatImageURL } from "@/hooks/metadata/coin-utils";

interface DAICOOrgHeaderProps {
  org: {
    id: string;
    name: string | null;
    symbol: string | null;
    image: string | null;
    description: string | null;
  };
  chainName: string;
  explorerUrl: string;
  shortenAddress: (addr: string) => string;
  tokenAddress?: string; // Share or Loot token address
}

export function DAICOOrgHeader({ org, chainName, explorerUrl, shortenAddress, tokenAddress }: DAICOOrgHeaderProps) {
  return (
    <Card className="p-8 bg-gradient-to-br from-primary/5 via-purple-500/5 to-background border-primary/20">
      <div className="flex items-start gap-6">
        <img
          src={formatImageURL(org.image) || "/default_org.png"}
          alt={org.name || "DAO"}
          className="w-20 h-20 rounded-2xl object-cover border-2 border-primary/20 flex-shrink-0 shadow-lg"
          onError={(e) => {
            e.currentTarget.src = "/default_org.png";
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h1 className="text-4xl font-bold">{org.name || "Unnamed DAO"}</h1>
            <Badge variant="outline">{chainName}</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap mb-3">
            <Badge variant="secondary" className="font-mono">
              {org.symbol || shortenAddress(org.id)}
            </Badge>
            <span>•</span>
            <a
              href={`${explorerUrl}/address/${org.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              DAO {shortenAddress(org.id)}
              <ExternalLink className="w-3 h-3" />
            </a>
            {tokenAddress && (
              <>
                <span>•</span>
                <a
                  href={`${explorerUrl}/address/${tokenAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <Coins className="w-3 h-3" />
                  Token {shortenAddress(tokenAddress)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </>
            )}
          </div>
          {org.description && <p className="text-muted-foreground">{org.description}</p>}
        </div>
      </div>
    </Card>
  );
}
