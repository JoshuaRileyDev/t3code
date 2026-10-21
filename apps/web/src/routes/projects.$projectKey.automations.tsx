import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TimerIcon, Trash2Icon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  DEFAULT_MODEL,
  ProviderInstanceId,
  type ModelSelection,
  type ThreadId,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { useAtomCommand } from "../state/use-atom-command";
import { threadEnvironment } from "../state/threads";
import {
  waitForSettledServerThread,
  waitForStartedServerThread,
} from "../components/ChatView.logic";
import { newMessageId, newThreadId } from "../lib/utils";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE } from "../types";

import { AutomationWizardDialog } from "../components/automation/AutomationWizardDialog";
import { TriggerWizardDialog } from "../components/automation/TriggerWizardDialog";
import { Button } from "../components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { SidebarInset } from "../components/ui/sidebar";
import { Switch } from "../components/ui/switch";
import { cn } from "~/lib/utils";
import { useClientSettings } from "../hooks/useSettings";
import { selectProjectGroupingSettings } from "../logicalProject";
import {
  buildProjectAutomationExecutionLabel,
  buildProjectAutomationPromptPreview,
  buildProjectAutomationScheduleLabel,
  buildProjectAutomationStartLabel,
  buildProjectAutomationUpdatedLabel,
  type ProjectAutomation,
  updateProjectAutomation,
  useProjectAutomations,
} from "../projectAutomations";
import {
  buildProjectTriggerSummary,
  type ProjectTrigger,
  updateProjectTrigger,
  useProjectTriggers,
} from "../projectTriggers";
import { buildSidebarProjectSnapshots } from "../sidebarProjectGrouping";
import { useProjects } from "../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { toastManager, stackedThreadToast } from "../components/ui/toast";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";

function ProjectAutomationsRouteView() {
  const navigate = useNavigate();
  const projectKey = Route.useParams({ select: (params) => params.projectKey });
  const projects = useProjects();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const environmentLabelById = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.label] as const),
      ),
    [environments],
  );
  const projectSnapshots = useMemo(
    () =>
      buildSidebarProjectSnapshots({
        projects,
        settings: projectGroupingSettings,
        primaryEnvironmentId,
        resolveEnvironmentLabel: (environmentId) => environmentLabelById.get(environmentId) ?? null,
      }),
    [environmentLabelById, primaryEnvironmentId, projectGroupingSettings, projects],
  );
  const project = useMemo(
    () => projectSnapshots.find((snapshot) => snapshot.projectKey === projectKey) ?? null,
    [projectKey, projectSnapshots],
  );
  const [automations, setAutomations] = useProjectAutomations(projectKey);
  const [triggers, setTriggers] = useProjectTriggers(projectKey);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [triggerWizardOpen, setTriggerWizardOpen] = useState(false);
  const [runningAutomationId, setRunningAutomationId] = useState<string | null>(null);
  const createThread = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const startThreadTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const archiveThread = useAtomCommand(threadEnvironment.archive, { reportFailure: false });
  const deleteThread = useAtomCommand(threadEnvironment.delete, { reportFailure: false });

  const handleCreateAutomation = (automation: ProjectAutomation) => {
    setAutomations((current) => [automation, ...current]);
  };

  const handleDeleteAutomation = useCallback(
    (automationId: string) => {
      setAutomations((current) => current.filter((automation) => automation.id !== automationId));
    },
    [setAutomations],
  );

  const handleCreateTrigger = useCallback(
    (trigger: ProjectTrigger) => {
      setTriggers((current) => [trigger, ...current]);
    },
    [setTriggers],
  );

  const handleToggleTrigger = useCallback(
    (triggerId: string, enabled: boolean) => {
      setTriggers((current) =>
        current.map((trigger) =>
          trigger.id === triggerId ? updateProjectTrigger(trigger, { enabled }) : trigger,
        ),
      );
    },
    [setTriggers],
  );

  const handleDeleteTrigger = useCallback(
    (triggerId: string) => {
      setTriggers((current) => current.filter((trigger) => trigger.id !== triggerId));
    },
    [setTriggers],
  );

  const handleToggleAutomation = (automationId: string, enabled: boolean) => {
    setAutomations((current) =>
      current.map((automation) =>
        automation.id === automationId
          ? updateProjectAutomation(automation, { enabled })
          : automation,
      ),
    );
  };

  const handleRunAutomation = useCallback(
    async (automation: ProjectAutomation) => {
      if (!project) return;
      setRunningAutomationId(automation.id);
      let nextThreadId: ThreadId | null = null;
      try {
        nextThreadId = newThreadId();
        const nextModelSelection: ModelSelection =
          project.defaultModelSelection ??
          createModelSelection(ProviderInstanceId.make("codex"), DEFAULT_MODEL);
        const createdAt = new Date().toISOString();
        const createResult = await createThread({
          environmentId: project.environmentId,
          input: {
            threadId: nextThreadId,
            projectId: project.id,
            title: automation.title,
            modelSelection: nextModelSelection,
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: DEFAULT_INTERACTION_MODE,
            branch:
              automation.execution?.workspaceMode === "main-branch"
                ? (automation.execution.branchName?.trim() ?? null)
                : null,
            worktreePath: null,
            createdAt,
          },
        });
        if (createResult._tag === "Failure") {
          throw squashAtomCommandFailure(createResult);
        }
        const startResult = await startThreadTurn({
          environmentId: project.environmentId,
          input: {
            threadId: nextThreadId,
            message: {
              messageId: newMessageId(),
              role: "user",
              text: automation.prompt,
              attachments: [],
            },
            modelSelection: nextModelSelection,
            titleSeed: automation.title,
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: DEFAULT_INTERACTION_MODE,
            createdAt,
          },
        });
        if (startResult._tag === "Failure") {
          throw squashAtomCommandFailure(startResult);
        }
        await waitForStartedServerThread(scopeThreadRef(project.environmentId, nextThreadId));
        toastManager.add(
          stackedThreadToast({
            type: "success",
            title: "Automation started",
            description: automation.title,
          }),
        );
        if (automation.execution?.archiveThread) {
          void (async () => {
            const threadRef = scopeThreadRef(project.environmentId, nextThreadId);
            const settled = await waitForSettledServerThread(threadRef);
            if (!settled) {
              console.warn("Automation thread did not settle before archive timeout", {
                automationId: automation.id,
                threadId: nextThreadId,
              });
              return;
            }
            const archiveResult = await archiveThread({
              environmentId: project.environmentId,
              input: { threadId: nextThreadId },
            });
            if (archiveResult._tag === "Failure") {
              throw squashAtomCommandFailure(archiveResult);
            }
          })().catch((error) => {
            console.error("Failed to auto-archive automation thread", {
              automationId: automation.id,
              threadId: nextThreadId,
              error,
            });
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Automation archived failed",
                description:
                  error instanceof Error
                    ? error.message
                    : "Unexpected error archiving the automation thread.",
              }),
            );
          });
        }
      } catch (error) {
        console.error("Failed to run automation manually", { automationId: automation.id, error });
        if (nextThreadId) {
          void deleteThread({
            environmentId: project.environmentId,
            input: { threadId: nextThreadId },
          });
        }
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not start automation",
            description:
              error instanceof Error ? error.message : "Unexpected error starting automation.",
          }),
        );
      } finally {
        setRunningAutomationId(null);
      }
    },
    [archiveThread, createThread, deleteThread, project, startThreadTurn],
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
        <header
          className={cn(
            "border-b border-border px-3 py-2 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:px-5",
            COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          )}
        >
          <div className="flex min-h-7 items-center gap-2 sm:min-h-6">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">Automations & triggers</p>
              <p className="truncate text-xs text-muted-foreground">
                {project ? project.displayName : "Project not found"}
              </p>
            </div>
            <Button size="sm" onClick={() => setWizardOpen(true)} disabled={!project}>
              <TimerIcon className="size-4" />
              Create automation
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          {project ? (
            <div className="mx-auto grid w-full max-w-7xl gap-6 px-3 py-4 sm:px-5 lg:grid-cols-2 lg:gap-5">
              <section className="rounded-2xl border border-border/70 bg-card/40 p-4 shadow-sm/5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Automations</h2>
                    <p className="text-xs text-muted-foreground">
                      Enable or disable the project’s scheduled work.
                    </p>
                  </div>
                  <Button size="xs" variant="outline" onClick={() => setWizardOpen(true)}>
                    New automation
                  </Button>
                </div>

                <div className="mt-4 space-y-3">
                  {automations.length === 0 ? (
                    <Empty className="py-10">
                      <EmptyHeader className="max-w-none">
                        <EmptyTitle className="text-base">No automations yet</EmptyTitle>
                        <EmptyDescription className="mt-1 text-sm text-muted-foreground">
                          Create a scheduled automation for {project.displayName} to get started.
                        </EmptyDescription>
                        <div className="mt-4 flex justify-center">
                          <Button size="sm" onClick={() => setWizardOpen(true)}>
                            <TimerIcon className="size-4" />
                            Create automation
                          </Button>
                        </div>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    automations.map((automation) => (
                      <AutomationCard
                        key={automation.id}
                        automation={automation}
                        onToggle={handleToggleAutomation}
                        onDelete={handleDeleteAutomation}
                        onRun={handleRunAutomation}
                        isRunning={runningAutomationId === automation.id}
                      />
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-border/70 bg-card/40 p-4 shadow-sm/5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Triggers</h2>
                    <p className="text-xs text-muted-foreground">
                      Integration-based triggers for this project.
                    </p>
                  </div>
                  <Button size="xs" variant="outline" onClick={() => setTriggerWizardOpen(true)}>
                    New trigger
                  </Button>
                </div>

                <div className="mt-4 space-y-3">
                  {triggers.length === 0 ? (
                    <Empty className="py-10">
                      <EmptyHeader className="max-w-none">
                        <EmptyTitle className="text-base">No triggers yet</EmptyTitle>
                        <EmptyDescription className="mt-1 text-sm text-muted-foreground">
                          Add a GitHub trigger for {project.displayName} to get started.
                        </EmptyDescription>
                        <div className="mt-4 flex justify-center">
                          <Button size="sm" onClick={() => setTriggerWizardOpen(true)}>
                            New trigger
                          </Button>
                        </div>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    triggers.map((trigger) => (
                      <div
                        key={trigger.id}
                        className="rounded-xl border border-border/70 bg-background/70 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{trigger.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {buildProjectTriggerSummary(trigger)}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                              trigger.enabled
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {trigger.enabled ? "Active" : "Paused"}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <Switch
                            checked={trigger.enabled}
                            onCheckedChange={(checked) => handleToggleTrigger(trigger.id, checked)}
                          />
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => handleDeleteTrigger(trigger.id)}
                            aria-label={`Delete ${trigger.title}`}
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 items-center px-3 py-8 sm:px-5">
              <Empty className="w-full py-16">
                <EmptyHeader className="max-w-none">
                  <EmptyTitle className="text-xl">Project not found</EmptyTitle>
                  <EmptyDescription className="mt-2 text-sm text-muted-foreground">
                    The project you opened no longer exists or is no longer available.
                  </EmptyDescription>
                  <div className="mt-6 flex justify-center gap-2">
                    <Button variant="outline" onClick={() => void navigate({ to: "/" })}>
                      Go home
                    </Button>
                  </div>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </div>
      </div>

      <AutomationWizardDialog
        open={wizardOpen}
        projectName={project?.displayName ?? "this project"}
        onOpenChange={setWizardOpen}
        onCreateAutomation={handleCreateAutomation}
      />

      <TriggerWizardDialog
        open={triggerWizardOpen}
        project={project}
        onOpenChange={setTriggerWizardOpen}
        onCreateTrigger={handleCreateTrigger}
      />
    </SidebarInset>
  );
}

function AutomationCard({
  automation,
  onToggle,
  onDelete,
  onRun,
  isRunning,
}: {
  automation: ProjectAutomation;
  onToggle: (automationId: string, enabled: boolean) => void;
  onDelete: (automationId: string) => void;
  onRun: (automation: ProjectAutomation) => Promise<void>;
  isRunning: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{automation.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {buildProjectAutomationScheduleLabel(automation.schedule)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="outline"
            onClick={() => void onRun(automation)}
            disabled={isRunning}
          >
            {isRunning ? "Running…" : "Run now"}
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => onDelete(automation.id)}
            aria-label={`Delete ${automation.title}`}
          >
            <Trash2Icon className="size-4" />
          </Button>
          <span className="text-xs text-muted-foreground">{automation.enabled ? "On" : "Off"}</span>
          <Switch
            checked={automation.enabled}
            onCheckedChange={(checked) => onToggle(automation.id, checked)}
          />
        </div>
      </div>

      <div className="mt-3 space-y-2 text-xs text-muted-foreground">
        <p className="whitespace-pre-wrap break-words">
          {buildProjectAutomationPromptPreview(automation.prompt)}
        </p>
        <p>
          {buildProjectAutomationStartLabel(automation.schedule.startAt)} · Updated{" "}
          {buildProjectAutomationUpdatedLabel(automation.updatedAt)}
        </p>
        <p>{buildProjectAutomationExecutionLabel(automation.execution)}</p>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectKey/automations")({
  component: ProjectAutomationsRouteView,
});
