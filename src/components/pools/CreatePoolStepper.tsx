import { cn } from "@/lib/utils";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Pencil } from "lucide-react";

export type CreatePoolStep = { title: string; description?: string };

type Props = {
  steps: CreatePoolStep[];
  currentStep: number; // 1-based
  onStepChange?: (step: number) => void;
  className?: string;
  /** Optional gate to control which steps are allowed to be jumped to (e.g., validation). */
  canStepTo?: (fromStep: number, toStep: number) => boolean;
};

export function Stepper({
  steps,
  currentStep,
  onStepChange,
  className,
  canStepTo,
}: Props) {
  const canGoTo = (to: number) => {
    // Only allow going to previous steps by default
    const defaultAllowed = to < currentStep;
    return canStepTo
      ? canStepTo(currentStep, to) && defaultAllowed
      : defaultAllowed;
  };

  return (
    <Card
      className={cn(
        "rounded-2xl p-4 md:p-6 bg-background border-2 border-border",
        className,
      )}
    >
      <ol className="relative ml-2" role="list" aria-label="Progress">
        {steps.map((step, i) => {
          const n = i + 1;
          const isActive = n === currentStep;
          const isDone = n < currentStep;
          const isClickable = canGoTo(n);

          const handleGo = () => {
            if (isClickable) onStepChange?.(n);
          };

          return (
            <li
              key={step.title}
              role="listitem"
              className={cn(
                "flex items-start gap-4 group rounded-xl",
                i !== steps.length - 1 && "pb-8",
                isClickable &&
                  "hover:bg-accent/40 transition-colors cursor-pointer",
              )}
              onClick={handleGo}
            >
              {/* connector line */}
              {i !== steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-[1.25rem] top-10 h-[calc(100%-5.5rem)] w-[2px] bg-muted-foreground/40"
                />
              )}

              {/* number bubble */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleGo();
                }}
                aria-label={
                  isClickable ? `Go back to step ${n} to edit` : `Step ${n}`
                }
                aria-current={isActive ? "step" : undefined}
                aria-disabled={!isClickable && !isActive}
                tabIndex={isClickable || isActive ? 0 : -1}
                className={cn(
                  "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border text-base font-semibold transition-colors",
                  isDone &&
                    "bg-primary text-primary-foreground border-primary group-hover:opacity-90",
                  isActive &&
                    !isDone &&
                    "bg-primary/10 text-primary border-primary",
                  !isActive &&
                    !isDone &&
                    "bg-muted text-muted-foreground border-muted-foreground/30",
                  !isClickable && !isActive && "cursor-not-allowed",
                )}
              >
                {n}
              </button>

              {/* label + actions */}
              <div className="pt-1 flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Step {n}</p>
                <div
                  className={cn(
                    "text-lg font-semibold truncate",
                    isActive ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.title}
                </div>
                {step.description ? (
                  <p className="text-sm text-muted-foreground">
                    {step.description}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
