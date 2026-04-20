import {
  CLAUDE_AGENT_EFFORT_OPTIONS,
  CODEX_REASONING_EFFORT_OPTIONS,
  AutomationProjectConfig,
  AutomationProjectEnvMode,
  AutomationPermissionMode,
  ProjectId,
  type ClaudeAgentEffort,
  type CodexReasoningEffort,
  type AutomationSchedule,
  type ModelSelection,
  type ProviderKind,
} from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { isElectron } from "../env";
import { useStore } from "../store";
import { useServerProviders } from "~/rpc/serverState";
import {
  getDefaultServerModel,
  getProviderModelCapabilities,
  getProviderModels,
} from "~/providerModels";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Button } from "~/components/ui/button";
import {
  automationCreateMutationOptions,
  automationClearRunsMutationOptions,
  automationDeleteMutationOptions,
  automationListQueryOptions,
  automationPauseMutationOptions,
  automationResumeMutationOptions,
  automationRunNowMutationOptions,
  automationRunsQueryOptions,
  automationUpdateMutationOptions,
} from "~/lib/automationReactQuery";
import { toastManager } from "~/components/ui/toast";

const schedulePresetOptions = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

type SchedulePreset = (typeof schedulePresetOptions)[number]["value"];

interface FormState {
  name: string;
  prompt: string;
  projectId: string | "";
  autoCreatePr: boolean;
  envMode: AutomationProjectEnvMode;
  permissionMode: AutomationPermissionMode;
  localBranch: string;
  worktreeBaseBranch: string;
  worktreeBranch: string;
  provider: ProviderKind;
  model: string;
  thinkingLevel: string;
  preset: SchedulePreset;
  timezone: string;
  time: string;
  intervalHours: number;
  weeklyDays: string;
  dayOfMonth: number;
  month: number;
}

const initialTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function createInitialForm(provider: ProviderKind, model: string): FormState {
  return {
    name: "",
    prompt: "",
    projectId: "",
    autoCreatePr: false,
    envMode: "local",
    permissionMode: "full-access",
    localBranch: "",
    worktreeBaseBranch: "main",
    worktreeBranch: "",
    provider,
    model,
    thinkingLevel: "",
    preset: "weekdays",
    timezone: initialTimezone,
    time: "09:00",
    intervalHours: 1,
    weeklyDays: "mon,tue,wed,thu,fri",
    dayOfMonth: 1,
    month: 1,
  };
}

function formToSchedule(form: FormState): AutomationSchedule {
  if (form.preset === "hourly") {
    return { kind: "hourly", intervalHours: Math.max(1, Math.min(24, form.intervalHours)) };
  }
  if (form.preset === "daily") {
    return { kind: "daily", time: form.time, timezone: form.timezone };
  }
  if (form.preset === "weekdays") {
    return { kind: "weekdays", time: form.time, timezone: form.timezone };
  }
  if (form.preset === "weekly") {
    const days = form.weeklyDays
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean) as Array<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun">;
    return {
      kind: "weekly",
      days: days.length > 0 ? days : ["mon"],
      time: form.time,
      timezone: form.timezone,
    };
  }
  if (form.preset === "monthly") {
    return {
      kind: "monthly",
      dayOfMonth: Math.max(1, Math.min(31, form.dayOfMonth)),
      time: form.time,
      timezone: form.timezone,
    };
  }
  return {
    kind: "yearly",
    month: Math.max(1, Math.min(12, form.month)),
    dayOfMonth: Math.max(1, Math.min(31, form.dayOfMonth)),
    time: form.time,
    timezone: form.timezone,
  };
}

function scheduleToFormPatch(
  schedule: AutomationSchedule,
): Pick<
  FormState,
  "preset" | "intervalHours" | "timezone" | "time" | "weeklyDays" | "dayOfMonth" | "month"
> {
  if (schedule.kind === "hourly") {
    return {
      preset: "hourly",
      intervalHours: schedule.intervalHours,
      timezone: initialTimezone,
      time: "09:00",
      weeklyDays: "mon,tue,wed,thu,fri",
      dayOfMonth: 1,
      month: 1,
    };
  }
  if (schedule.kind === "daily") {
    return {
      preset: "daily",
      intervalHours: 1,
      timezone: schedule.timezone,
      time: schedule.time,
      weeklyDays: "mon,tue,wed,thu,fri",
      dayOfMonth: 1,
      month: 1,
    };
  }
  if (schedule.kind === "weekdays") {
    return {
      preset: "weekdays",
      intervalHours: 1,
      timezone: schedule.timezone,
      time: schedule.time,
      weeklyDays: "mon,tue,wed,thu,fri",
      dayOfMonth: 1,
      month: 1,
    };
  }
  if (schedule.kind === "weekly") {
    return {
      preset: "weekly",
      intervalHours: 1,
      timezone: schedule.timezone,
      time: schedule.time,
      weeklyDays: schedule.days.join(","),
      dayOfMonth: 1,
      month: 1,
    };
  }
  if (schedule.kind === "monthly") {
    return {
      preset: "monthly",
      intervalHours: 1,
      timezone: schedule.timezone,
      time: schedule.time,
      weeklyDays: "mon,tue,wed,thu,fri",
      dayOfMonth: schedule.dayOfMonth,
      month: 1,
    };
  }
  return {
    preset: "yearly",
    intervalHours: 1,
    timezone: schedule.timezone,
    time: schedule.time,
    weeklyDays: "mon,tue,wed,thu,fri",
    dayOfMonth: schedule.dayOfMonth,
    month: schedule.month,
  };
}

function scheduleSummary(schedule: AutomationSchedule): string {
  if (schedule.kind === "hourly") return `Every ${schedule.intervalHours} hour(s)`;
  if (schedule.kind === "daily") return `Daily at ${schedule.time} (${schedule.timezone})`;
  if (schedule.kind === "weekdays") return `Weekdays at ${schedule.time} (${schedule.timezone})`;
  if (schedule.kind === "weekly")
    return `${schedule.days.join(", ")} at ${schedule.time} (${schedule.timezone})`;
  if (schedule.kind === "monthly")
    return `Monthly on day ${schedule.dayOfMonth} at ${schedule.time} (${schedule.timezone})`;
  return `Yearly on ${schedule.month}/${schedule.dayOfMonth} at ${schedule.time} (${schedule.timezone})`;
}

function toCodexThinkingLevel(value: string): CodexReasoningEffort | undefined {
  return CODEX_REASONING_EFFORT_OPTIONS.includes(value as CodexReasoningEffort)
    ? (value as CodexReasoningEffort)
    : undefined;
}

function toClaudeThinkingLevel(value: string): ClaudeAgentEffort | undefined {
  return CLAUDE_AGENT_EFFORT_OPTIONS.includes(value as ClaudeAgentEffort)
    ? (value as ClaudeAgentEffort)
    : undefined;
}

function toModelSelection(form: FormState): ModelSelection {
  if (form.provider === "codex") {
    const reasoningEffort = toCodexThinkingLevel(form.thinkingLevel);
    return {
      provider: "codex",
      model: form.model,
      ...(reasoningEffort !== undefined ? { options: { reasoningEffort } } : {}),
    };
  }
  const effort = toClaudeThinkingLevel(form.thinkingLevel);
  return {
    provider: "claudeAgent",
    model: form.model,
    ...(effort !== undefined ? { options: { effort } } : {}),
  };
}

function formToProjectConfig(form: FormState): AutomationProjectConfig | null {
  if (form.projectId.length === 0) {
    return null;
  }
  return {
    projectId: form.projectId as ProjectId,
    autoCreatePr: form.autoCreatePr,
    envMode: form.envMode,
    permissionMode: form.permissionMode,
    localBranch:
      form.envMode === "local" && form.localBranch.trim().length > 0
        ? form.localBranch.trim()
        : null,
    worktreeBaseBranch:
      form.envMode === "worktree" && form.worktreeBaseBranch.trim().length > 0
        ? form.worktreeBaseBranch.trim()
        : null,
    worktreeBranch:
      form.envMode === "worktree" && form.worktreeBranch.trim().length > 0
        ? form.worktreeBranch.trim()
        : null,
  };
}

function AutomationsRouteView() {
  const queryClient = useQueryClient();
  const projects = useStore((state) =>
    Object.values(state.environmentStateById).flatMap((environmentState) =>
      Object.values(environmentState.projectById),
    ),
  );
  const providers = useServerProviders();
  const defaultProvider: ProviderKind =
    providers.find((provider) => provider.enabled)?.provider ?? "codex";
  const defaultModel = getDefaultServerModel(providers, defaultProvider);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() =>
    createInitialForm(defaultProvider, defaultModel),
  );

  const automationsQuery = useQuery(automationListQueryOptions());
  const automations = automationsQuery.data?.automations ?? [];
  const selectedAutomation =
    automations.find((automation) => automation.id === selectedAutomationId) ?? null;

  const runsQuery = useQuery(
    automationRunsQueryOptions({
      automationId: selectedAutomationId ?? "",
      limit: 20,
    }),
  );

  useEffect(() => {
    if (selectedAutomation) {
      setForm({
        name: selectedAutomation.name,
        prompt: selectedAutomation.prompt,
        projectId: selectedAutomation.projectConfig?.projectId ?? "",
        autoCreatePr: selectedAutomation.projectConfig?.autoCreatePr ?? false,
        envMode: selectedAutomation.projectConfig?.envMode ?? "local",
        permissionMode: selectedAutomation.projectConfig?.permissionMode ?? "full-access",
        localBranch: selectedAutomation.projectConfig?.localBranch ?? "",
        worktreeBaseBranch: selectedAutomation.projectConfig?.worktreeBaseBranch ?? "main",
        worktreeBranch: selectedAutomation.projectConfig?.worktreeBranch ?? "",
        provider: selectedAutomation.modelSelection.provider,
        model: selectedAutomation.modelSelection.model,
        thinkingLevel:
          selectedAutomation.modelSelection.provider === "codex"
            ? (selectedAutomation.modelSelection.options?.reasoningEffort ?? "")
            : ((selectedAutomation.modelSelection.options as { effort?: string } | undefined)
                ?.effort ?? ""),
        ...scheduleToFormPatch(selectedAutomation.schedule),
      });
      return;
    }

    setForm((previous) => ({
      ...createInitialForm(defaultProvider, getDefaultServerModel(providers, defaultProvider)),
      prompt: previous.prompt,
    }));
  }, [defaultProvider, providers, selectedAutomation]);

  const createMutation = useMutation(automationCreateMutationOptions({ queryClient }));
  const updateMutation = useMutation(automationUpdateMutationOptions({ queryClient }));
  const deleteMutation = useMutation(automationDeleteMutationOptions({ queryClient }));
  const runNowMutation = useMutation(automationRunNowMutationOptions({ queryClient }));
  const clearRunsMutation = useMutation(automationClearRunsMutationOptions({ queryClient }));
  const pauseMutation = useMutation(automationPauseMutationOptions({ queryClient }));
  const resumeMutation = useMutation(automationResumeMutationOptions({ queryClient }));

  const providerModels = useMemo(
    () => getProviderModels(providers, form.provider).map((model) => model.slug),
    [providers, form.provider],
  );
  const providerCapabilities = useMemo(
    () =>
      getProviderModelCapabilities(
        getProviderModels(providers, form.provider),
        form.model,
        form.provider,
      ),
    [form.model, form.provider, providers],
  );
  const thinkingLevelOptions = providerCapabilities.reasoningEffortLevels;

  useEffect(() => {
    if (providerModels.length === 0) {
      return;
    }
    if (providerModels.includes(form.model)) {
      return;
    }
    setForm((current) => ({ ...current, model: providerModels[0] ?? defaultModel }));
  }, [defaultModel, form.model, providerModels]);

  useEffect(() => {
    if (thinkingLevelOptions.length === 0) {
      if (form.thinkingLevel.length > 0) {
        setForm((current) => ({ ...current, thinkingLevel: "" }));
      }
      return;
    }
    if (form.thinkingLevel.length === 0) {
      return;
    }
    const supported = thinkingLevelOptions.some((option) => option.value === form.thinkingLevel);
    if (!supported) {
      setForm((current) => ({ ...current, thinkingLevel: "" }));
    }
  }, [form.thinkingLevel, thinkingLevelOptions]);

  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    runNowMutation.isPending ||
    clearRunsMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending;

  const handleSave = async () => {
    if (form.name.trim().length === 0) {
      toastManager.add({ type: "error", title: "Name is required." });
      return;
    }
    if (form.prompt.trim().length === 0) {
      toastManager.add({ type: "error", title: "Prompt is required." });
      return;
    }
    try {
      if (selectedAutomation) {
        const updated = await updateMutation.mutateAsync({
          id: selectedAutomation.id,
          name: form.name,
          prompt: form.prompt,
          projectConfig: formToProjectConfig(form),
          modelSelection: toModelSelection(form),
          schedule: formToSchedule(form),
        });
        setSelectedAutomationId(updated.id);
        toastManager.add({ type: "success", title: "Automation updated." });
      } else {
        const created = await createMutation.mutateAsync({
          name: form.name,
          prompt: form.prompt,
          projectConfig: formToProjectConfig(form),
          modelSelection: toModelSelection(form),
          schedule: formToSchedule(form),
        });
        setSelectedAutomationId(created.id);
        toastManager.add({ type: "success", title: "Automation created." });
      }
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not save automation.",
        description: error instanceof Error ? error.message : "Unexpected error.",
      });
    }
  };

  const resetFormForCreate = () => {
    setSelectedAutomationId(null);
    setForm(createInitialForm(defaultProvider, getDefaultServerModel(providers, defaultProvider)));
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {!isElectron && (
          <header className="border-b border-border px-3 py-2 sm:px-5">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="size-7 shrink-0 md:hidden" />
              <span className="text-sm font-medium text-foreground">Automations</span>
            </div>
          </header>
        )}

        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Automations
            </span>
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[360px_1fr]">
          <aside className="min-h-0 overflow-y-auto border-b border-border md:border-r md:border-b-0">
            <div className="flex items-center justify-between px-3 py-3">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                All automations
              </span>
              <Button size="xs" variant="outline" onClick={resetFormForCreate}>
                New
              </Button>
            </div>
            <div className="space-y-2 px-2 pb-3">
              {automations.map((automation) => (
                <button
                  key={automation.id}
                  type="button"
                  className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                    selectedAutomationId === automation.id
                      ? "border-primary/45 bg-primary/8"
                      : "border-border hover:bg-accent/50"
                  }`}
                  onClick={() => setSelectedAutomationId(automation.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{automation.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${
                        automation.status === "active"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {automation.status}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {scheduleSummary(automation.schedule)}
                  </p>
                </button>
              ))}
              {automations.length === 0 && (
                <p className="px-2 py-8 text-center text-xs text-muted-foreground/70">
                  No automations yet.
                </p>
              )}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h1 className="text-lg font-semibold">
                    {selectedAutomation ? "Edit automation" : "Create automation"}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Set prompt, model, optional project config, and schedule.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedAutomation ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isMutating}
                        onClick={async () => {
                          try {
                            await runNowMutation.mutateAsync({ id: selectedAutomation.id });
                            toastManager.add({ type: "success", title: "Automation run started." });
                          } catch (error) {
                            toastManager.add({
                              type: "error",
                              title: "Could not start run.",
                              description:
                                error instanceof Error ? error.message : "Unexpected error.",
                            });
                          }
                        }}
                      >
                        Run now
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isMutating}
                        onClick={async () => {
                          try {
                            if (selectedAutomation.status === "active") {
                              await pauseMutation.mutateAsync({ id: selectedAutomation.id });
                              toastManager.add({ type: "success", title: "Automation paused." });
                            } else {
                              await resumeMutation.mutateAsync({ id: selectedAutomation.id });
                              toastManager.add({ type: "success", title: "Automation resumed." });
                            }
                          } catch (error) {
                            toastManager.add({
                              type: "error",
                              title: "Could not update status.",
                              description:
                                error instanceof Error ? error.message : "Unexpected error.",
                            });
                          }
                        }}
                      >
                        {selectedAutomation.status === "active" ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isMutating}
                        onClick={async () => {
                          try {
                            await clearRunsMutation.mutateAsync({
                              automationId: selectedAutomation.id,
                            });
                            toastManager.add({ type: "success", title: "Run logs cleared." });
                          } catch (error) {
                            toastManager.add({
                              type: "error",
                              title: "Could not clear run logs.",
                              description:
                                error instanceof Error ? error.message : "Unexpected error.",
                            });
                          }
                        }}
                      >
                        Clear logs
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isMutating}
                        onClick={async () => {
                          try {
                            await deleteMutation.mutateAsync({ id: selectedAutomation.id });
                            setSelectedAutomationId(null);
                            toastManager.add({ type: "success", title: "Automation deleted." });
                          } catch (error) {
                            toastManager.add({
                              type: "error",
                              title: "Could not delete automation.",
                              description:
                                error instanceof Error ? error.message : "Unexpected error.",
                            });
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </>
                  ) : null}
                  <Button size="sm" onClick={() => void handleSave()} disabled={isMutating}>
                    {selectedAutomation ? "Save changes" : "Create"}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3">
                <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                  Name
                </label>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Weekly dependency update"
                />
              </div>

              <div className="grid gap-3">
                <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                  Prompt
                </label>
                <Textarea
                  value={form.prompt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, prompt: event.target.value }))
                  }
                  rows={7}
                  placeholder="Describe exactly what the automation should do each run."
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                    Project (optional)
                  </label>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={form.projectId}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, projectId: event.target.value }))
                    }
                  >
                    <option value="">No project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {form.projectId.length > 0 ? (
                <div className="rounded-lg border border-border p-4">
                  <h2 className="text-sm font-medium">Project options</h2>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.autoCreatePr}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            autoCreatePr: event.target.checked,
                          }))
                        }
                      />
                      Auto create PR
                    </label>

                    <div className="grid gap-2">
                      <label className="text-xs text-muted-foreground">Permissions</label>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={form.permissionMode}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            permissionMode: event.target.value as AutomationPermissionMode,
                          }))
                        }
                      >
                        <option value="read-only">Read access</option>
                        <option value="full-access">Full access</option>
                      </select>
                    </div>

                    <div className="grid gap-2">
                      <label className="text-xs text-muted-foreground">Environment</label>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={form.envMode}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            envMode: event.target.value as AutomationProjectEnvMode,
                          }))
                        }
                      >
                        <option value="local">Local</option>
                        <option value="worktree">Worktree</option>
                      </select>
                    </div>

                    {form.envMode === "local" ? (
                      <div className="grid gap-2">
                        <label className="text-xs text-muted-foreground">Branch (local)</label>
                        <Input
                          value={form.localBranch}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              localBranch: event.target.value,
                            }))
                          }
                          placeholder="main"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-2">
                          <label className="text-xs text-muted-foreground">
                            Base branch (worktree)
                          </label>
                          <Input
                            value={form.worktreeBaseBranch}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                worktreeBaseBranch: event.target.value,
                              }))
                            }
                            placeholder="main"
                          />
                        </div>
                        <div className="grid gap-2">
                          <label className="text-xs text-muted-foreground">Worktree branch</label>
                          <Input
                            value={form.worktreeBranch}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                worktreeBranch: event.target.value,
                              }))
                            }
                            placeholder="feature/automation-task"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                    Provider
                  </label>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={form.provider}
                    onChange={(event) => {
                      const provider = event.target.value as ProviderKind;
                      const nextModel = getDefaultServerModel(providers, provider);
                      setForm((current) => ({ ...current, provider, model: nextModel }));
                    }}
                  >
                    {providers.map((provider) => (
                      <option key={provider.provider} value={provider.provider}>
                        {provider.provider}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                    Model
                  </label>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={form.model}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, model: event.target.value }))
                    }
                  >
                    {providerModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {thinkingLevelOptions.length > 0 ? (
                <div className="grid gap-2 md:max-w-sm">
                  <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                    Thinking level
                  </label>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={form.thinkingLevel}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, thinkingLevel: event.target.value }))
                    }
                  >
                    <option value="">Provider default</option>
                    {thinkingLevelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="rounded-lg border border-border p-4">
                <h2 className="text-sm font-medium">Schedule</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="grid gap-2">
                    <label className="text-xs text-muted-foreground">Preset</label>
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={form.preset}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          preset: event.target.value as SchedulePreset,
                        }))
                      }
                    >
                      {schedulePresetOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {form.preset === "hourly" ? (
                    <div className="grid gap-2">
                      <label className="text-xs text-muted-foreground">Every N hours</label>
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        value={String(form.intervalHours)}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            intervalHours: Number(event.target.value) || 1,
                          }))
                        }
                      />
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-2">
                        <label className="text-xs text-muted-foreground">Time</label>
                        <Input
                          type="time"
                          value={form.time}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              time: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-xs text-muted-foreground">Timezone</label>
                        <Input
                          value={form.timezone}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, timezone: event.target.value }))
                          }
                          placeholder="Europe/London"
                        />
                      </div>
                    </>
                  )}

                  {form.preset === "weekly" ? (
                    <div className="grid gap-2 md:col-span-2">
                      <label className="text-xs text-muted-foreground">
                        Weekly days (comma-separated: mon,tue,wed)
                      </label>
                      <Input
                        value={form.weeklyDays}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, weeklyDays: event.target.value }))
                        }
                      />
                    </div>
                  ) : null}

                  {form.preset === "monthly" || form.preset === "yearly" ? (
                    <div className="grid gap-2">
                      <label className="text-xs text-muted-foreground">Day of month</label>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={String(form.dayOfMonth)}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            dayOfMonth: Number(event.target.value) || 1,
                          }))
                        }
                      />
                    </div>
                  ) : null}

                  {form.preset === "yearly" ? (
                    <div className="grid gap-2">
                      <label className="text-xs text-muted-foreground">Month</label>
                      <Input
                        type="number"
                        min={1}
                        max={12}
                        value={String(form.month)}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            month: Number(event.target.value) || 1,
                          }))
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {selectedAutomation ? (
                <div className="rounded-lg border border-border p-4">
                  <h2 className="text-sm font-medium">Recent runs</h2>
                  <div className="mt-3 space-y-2">
                    {(runsQuery.data?.runs ?? []).map((run) => (
                      <div key={run.id} className="rounded-md border border-border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            {run.trigger} - {new Date(run.startedAt).toLocaleString()}
                          </span>
                          <span className="text-xs font-medium uppercase tracking-[0.08em]">
                            {run.status}
                          </span>
                        </div>
                        {run.error ? (
                          <p className="mt-1 text-xs text-destructive">{run.error}</p>
                        ) : null}
                      </div>
                    ))}
                    {runsQuery.data?.runs.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70">No runs yet.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/automations")({
  component: AutomationsRouteView,
});
