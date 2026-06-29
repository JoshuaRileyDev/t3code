import type { ReactNode } from "react";
import { Button } from "../ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "../ui/dialog";
import { cn } from "~/lib/utils";

interface MultiStepWizardFrameProps {
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly steps: ReadonlyArray<string>;
  readonly activeStep: number;
  readonly onStepClick?: (stepIndex: number) => void;
  readonly error?: string | null;
  readonly children: ReactNode;
  readonly onCancel: () => void;
  readonly onBack?: () => void;
  readonly onNext?: () => void;
  readonly onConfirm?: () => void;
  readonly backLabel?: string;
  readonly nextLabel?: string;
  readonly confirmLabel?: string;
  readonly canGoBack?: boolean;
  readonly canGoNext?: boolean;
  readonly nextDisabled?: boolean;
  readonly isConfirming?: boolean;
}

export function MultiStepWizardFrame({
  title,
  description,
  steps,
  activeStep,
  onStepClick,
  error,
  children,
  onCancel,
  onBack,
  onNext,
  onConfirm,
  backLabel = "Back",
  nextLabel = "Next",
  confirmLabel = "Add",
  canGoBack = false,
  canGoNext = false,
  nextDisabled = false,
  isConfirming = false,
}: MultiStepWizardFrameProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <div
          className="grid gap-2 pt-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, steps.length)}, minmax(0, 1fr))` }}
        >
          {steps.map((label, index) => {
            const active = index === activeStep;
            const complete = index < activeStep;
            const clickable = onStepClick !== undefined && index <= activeStep;
            return (
              <button
                key={label}
                type="button"
                disabled={!clickable}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-left",
                  active
                    ? "border-primary/40 bg-primary/10"
                    : complete
                      ? "border-border bg-background"
                      : "border-border bg-muted/30 opacity-70",
                )}
                onClick={() => {
                  if (clickable) {
                    onStepClick?.(index);
                  }
                }}
              >
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full border text-xs font-semibold",
                    active
                      ? "border-primary text-primary"
                      : complete
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30 text-muted-foreground",
                  )}
                >
                  {complete ? "✓" : index + 1}
                </span>
                <span className="min-w-0 truncate text-xs font-semibold">{label}</span>
              </button>
            );
          })}
        </div>
      </DialogHeader>

      <DialogPanel className="space-y-5 p-5">
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {children}
      </DialogPanel>

      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        {canGoBack ? (
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            {backLabel}
          </Button>
        ) : null}
        {canGoNext ? (
          <Button type="button" size="sm" onClick={onNext} disabled={nextDisabled}>
            {nextLabel}
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? "Saving…" : confirmLabel}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
