import { cn } from "@/lib/utils";

export const Logo = ({ className }: { className?: string }) => {
  return (
    <img
      src={"/zammzamm.png"}
      alt="ZAMM LOGO"
      className={cn(`h-6 w-6 mr-2`, className || "")}
    />
  );
};
