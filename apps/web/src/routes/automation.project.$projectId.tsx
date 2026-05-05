import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { AutomationBoard } from "../components/AutomationBoard";
import { useAutomationStore } from "../automationStore";
import { readEnvironmentApi } from "../environmentApi";
import { usePrimaryEnvironmentId } from "../environments/primary";

export const Route = createFileRoute("/automation/project/$projectId")({
  component: AutomationProjectRoute,
});

function AutomationProjectRoute() {
  const { projectId } = Route.useParams();
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
      <h1 className="text-lg font-semibold">Project Automation Board</h1>
      <AutomationBoard
        environmentId={environmentId}
        issues={issues}
        projectId={projectId as never}
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
