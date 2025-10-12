import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export const ErrorAlert = ({
  error,
  className,
  children,
}: {
  error: Error;
  className?: string;
  children: React.ReactNode;
}) => {
  return (
    <Alert className={cn("w-full", className)} tone="destructive" emphasis="soft">
      <AlertTitle className="w-full">{error.name}</AlertTitle>
      <AlertDescription className="w-full">
        <p>{error.message}</p>
        {children}
      </AlertDescription>
    </Alert>
  );
};
