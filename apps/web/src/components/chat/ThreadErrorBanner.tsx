import { memo } from "react";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { CheckIcon, CircleAlertIcon, CopyIcon, XIcon } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";

const ERROR_BANNER_COPY_TARGET = "error-message";

const ThreadErrorCopyButton = memo(function ThreadErrorCopyButton({ error }: { error: string }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    target: ERROR_BANNER_COPY_TARGET,
  });
  const label = isCopied ? "Copied error" : "Copy error";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className="text-muted-foreground hover:text-foreground"
            onClick={() => copyToClipboard(error)}
            size="icon-xs"
            type="button"
            variant="ghost"
          />
        }
      >
        {isCopied ? <CheckIcon className="size-3 text-success" /> : <CopyIcon className="size-3" />}
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
});

export const ThreadErrorBanner = memo(function ThreadErrorBanner({
  error,
  onDismiss,
}: {
  error: string | null;
  onDismiss?: () => void;
}) {
  if (!error) return null;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-3 sm:px-5">
      <Alert variant="error" className="min-h-20">
        <CircleAlertIcon />
        <Tooltip>
          <TooltipTrigger
            render={
              <AlertDescription className="line-clamp-4 whitespace-pre-wrap wrap-break-word sm:line-clamp-5" />
            }
          >
            {error}
          </TooltipTrigger>
          <TooltipPopup side="top" className="max-w-96 whitespace-pre-wrap">
            {error}
          </TooltipPopup>
        </Tooltip>
        <AlertAction>
          <ThreadErrorCopyButton error={error} />
          {onDismiss && (
            <Button variant="ghost" size="icon-xs" aria-label="Dismiss error" onClick={onDismiss}>
              <XIcon className="text-destructive" />
            </Button>
          )}
        </AlertAction>
      </Alert>
    </div>
  );
});
