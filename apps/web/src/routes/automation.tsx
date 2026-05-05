import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { AutomationBoard } from "../components/AutomationBoard";
import { readEnvironmentApi } from "../environmentApi";
import { usePrimaryEnvironmentId } from "../environments/primary";
import { useAutomationStore } from "../automationStore";

export const Route = createFileRoute("/automation")({
  component: AutomationGlobalRoute,
});

function AutomationGlobalRoute() {
  const environmentId = usePrimaryEnvironmentId();
  if (!environmentId) {
    return <div className="p-4 text-sm text-muted-foreground">No environment connected.</div>;
  }
  const issues = useAutomationStore((state) => state.issues);
  const applySnapshot = useAutomationStore((state) => state.applySnapshot);
  const applyEvent = useAutomationStore((state) => state.applyEvent);

  useEffect(() => {
    const api = readEnvironmentApi(environmentId);
    if (!api) return;
    void api.automation
      .getBoardSnapshot()
      .then(applySnapshot)
      .catch(() => undefined);
    return api.automation.subscribeBoard((event) => {
      applyEvent(event);
    });
  }, [applyEvent, applySnapshot, environmentId]);

  const api = readEnvironmentApi(environmentId);

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Automation Board</h1>
      <AutomationBoard
        environmentId={environmentId}
        issues={issues}
        onCancel={async (issueId) => {
          if (!api) return;
          await api.automation.cancelIssue({ issueId });
        }}
        onEnqueue={async (issueId) => {
          if (!api) return;
          await api.automation.enqueueIssue({ issueId });
        }}
        onRetry={async (issueId) => {
          if (!api) return;
          await api.automation.retryIssue({ issueId });
        }}
      />
    </div>
  );
}
