import { cn } from "@/lib/utils";
import { Card } from "../ui/card";

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
    <div
      className={cn(
        "rounded-2xl p-4 md:p-6 bg-background border-2 border-sidebar-border",
        className,
      )}
    >
      <ol
        className={cn(
          "relative ml-2",
          // continuous vertical connector behind all items
          "before:content-[''] before:absolute before:left-[1.25rem] before:top-5 before:bottom-5 before:w-px before:bg-muted-foreground/40",
        )}
        role="list"
        aria-label="Progress"
      >
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
                  // Opaque active bubble + subtle ring keeps line from bleeding through
                  isActive &&
                    !isDone &&
                    "bg-background text-primary border-primary ring-2 ring-primary/30",
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
    </div>
  );
}
