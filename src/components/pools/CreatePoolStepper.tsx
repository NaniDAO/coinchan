import { cn } from "@/lib/utils";
import { Card } from "../ui/card";

export type CreatePoolStep = { title: string; description?: string };

export function Stepper({
  steps,
  currentStep,
  onStepChange,
  className,
}: {
  steps: Step[];
  currentStep: number; // 1-based
  onStepChange?: (step: number) => void;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "rounded-2xl p-4 md:p-6 bg-background border-2 border-border",
        className,
      )}
    >
      <ol className="relative ml-2">
        {steps.map((step, i) => {
          const n = i + 1;
          const isActive = n === currentStep;
          const isDone = n < currentStep;

          return (
            <li
              key={step.title}
              className={cn(
                "flex items-start gap-4",
                i !== steps.length - 1 && "pb-8",
              )}
            >
              {/* connector line */}
              {i !== steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-[1.25rem] top-10 h-[calc(100%-5.5rem)] w-[2px] bg-muted-foreground"
                />
              )}

              {/* number bubble */}
              <button
                type="button"
                onClick={() => onStepChange?.(n)}
                aria-label={`Go to step ${n}`}
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border text-base font-semibold transition-colors",
                  isDone &&
                    "bg-primary text-primary-foreground border-primary hover:opacity-90",
                  isActive &&
                    !isDone &&
                    "bg-primary/10 text-primary border-primary",
                  !isActive && !isDone && "bg-muted text-muted-foreground",
                )}
              >
                {n}
              </button>

              {/* label */}
              <div className="pt-1">
                <p className="text-xs text-muted-foreground">Step {n}</p>
                <div
                  className={cn(
                    "text-lg font-semibold",
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
