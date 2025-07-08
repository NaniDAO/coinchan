import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/8bit/dialog";
import { useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";

const useShowWhatZAMM = () => {
  return useQuery({
    queryKey: ["show-what-zamm"],
    queryFn: () => {
      const value = localStorage.getItem("show-what-zamm");
      if (value === null) return undefined;
      return value === "true";
    },
  });
};

export const WhatZAMM = () => {
  const { data: showWhatZAMM, refetch: refetchShowWhatZAMM } = useShowWhatZAMM();

  const shouldShow = showWhatZAMM === undefined || showWhatZAMM === true;

  if (!shouldShow) {
    return null;
  }

  return (
    <Dialog open={true} defaultOpen={true}>
      <DialogContent showClose={false} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-center ">what is ZAMM?</DialogTitle>
          <DialogDescription className="text-xs"></DialogDescription>
        </DialogHeader>
        <p>ZAMM lets anyone launch a coin on Ethereum—cheap, fast, and fair.</p>

        <p>
          <strong>step 1:</strong> hit "Create" and pick a name
        </p>
        <p>
          <strong>step 2:</strong> sell it, ZAMM auto-generates the 1 ETH pool
        </p>
        <p>
          <strong>step 3:</strong> trade anytime, no nonsense
        </p>

        <p>1% to the creator, 99% for the public</p>

        <p>
          <b>Zero barriers.</b> No whitelists. No presales.
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              localStorage.setItem("show-what-zamm", "false");
              await refetchShowWhatZAMM();
            }}
          >
            I get it!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
