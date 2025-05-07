import { useAccount, useConnect } from "wagmi";
import { truncAddress } from "./lib/address";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ConnectMenu() {
  const { isConnected, address } = useAccount();
  const { connect, connectors } = useConnect();

  if (isConnected) {
    return (
      <>
        <div>{address ? truncAddress(address) : ""}</div>
        {/* <SignButton /> */}
      </>
    );
  }

  return (
    <Dialog>
      <DialogTrigger className="appearance-none" asChild>
        <button className="hover:scale-105 focus:underline">🙏 Connect Wallet</button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {connectors.map((connector) => (
            <button
              className="flex items-center justify-start hover:scale-105 focus:underline"
              key={connector.id}
              onClick={() => connect({ connector })}
            >
              <img src={connector.icon ?? "/coinchan-logo.png"} alt={connector.name} className="w-6 h-6 mr-2" />
              <span>{connector.name}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
