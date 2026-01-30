import { Button } from "@/components/ui/button";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTranslation } from "react-i18next";
import { useAccount } from "wagmi";
import { useAddressZorgNFT } from "@/hooks/useAddressZorgNFT";

export const RainbowConnectButton = () => {
  const { t } = useTranslation();
  const { address } = useAccount();
  const { nftImage, hasNFT } = useAddressZorgNFT(address);

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, authenticationStatus, mounted }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready && account && chain && (!authenticationStatus || authenticationStatus === "authenticated");

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none",
                userSelect: "none",
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <Button onClick={openConnectModal} type="button" variant="outline" size="sm">
                    {t("common.login", "Login")}
                  </Button>
                );
              }

              if (chain.unsupported) {
                return (
                  <Button onClick={openChainModal} size="sm" variant="destructive" className="text-destructive">
                    {t("common.wrong_network", "Wrong Network")}
                  </Button>
                );
              }

              return (
                <div className="flex gap-2 justify-center items-center">
                  <Button onClick={openAccountModal} variant="outline" size="sm" type="button" className="gap-2">
                    {hasNFT && nftImage && (
                      <img src={nftImage} alt="ZORG NFT" className="h-5 w-5" style={{ imageRendering: "pixelated" }} />
                    )}
                    {account.displayName}
                    {account.displayBalance ? ` (${account.displayBalance})` : ""}
                  </Button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
};
