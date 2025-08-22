interface SwapErrorProps {
  message: string;
}

export const SwapError = ({ message }: SwapErrorProps) => {
  return (
    <div className="text-sm text-destructive mt-2 bg-background/50 p-2 rounded border border-destructive/20 break-words">
      {message}
    </div>
  );
};
