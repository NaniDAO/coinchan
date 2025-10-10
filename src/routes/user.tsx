import { UserPage } from "@/components/UserPage";
import { createFileRoute } from "@tanstack/react-router";
import { useAccount } from "wagmi";

export const Route = createFileRoute("/user")({
  component: RouteComponent,
});

function RouteComponent() {
  const { address, isConnected } = useAccount();

  if (!isConnected || !address) {
    return (
      <div className="py-5 w-full">
        <div className="flex justify-center py-5">
          <div className="w-full">
            <p className="text-center">Please connect your wallet to view your profile.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-5 w-full">
      <div className="flex justify-center py-5">
        <div className="w-full">
          <UserPage user={address} />
        </div>
      </div>
    </div>
  );
}
