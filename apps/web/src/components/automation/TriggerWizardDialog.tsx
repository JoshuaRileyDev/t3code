import { useAtomValue } from "@effect/atom-react";
import { useTheme } from "~/hooks/useTheme";
import {
  collectComposerSlashCommands,
  filterComposerSlashCommandsForAutocomplete,
} from "~/lib/composerSlashCommands";
import { useClientSettings } from "~/hooks/useSettings";
import { usePrimarySettings } from "~/hooks/useSettings";
import { primaryServerProvidersAtom } from "../../state/server";
import {
  type ComposerTrigger,
  detectComposerTrigger,
  replaceTextRange,
} from "../../composer-logic";
import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "../ComposerPromptEditor";
import { ComposerCommandMenu, type ComposerCommandItem } from "../chat/ComposerCommandMenu";
import { buildComposerSlashCommandItems } from "../chat/composerSlashCommands";
import { searchSlashCommandItems } from "../chat/composerSlashCommandSearch";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { Input } from "../ui/input";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Switch } from "../ui/switch";
import { Dialog, DialogPopup } from "../ui/dialog";
import { cn } from "~/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  INTEGRATION_DISPLAY_NAMES,
  INTEGRATION_KINDS,
  type IntegrationKind,
} from "@t3tools/contracts/settings";
import { type Project } from "~/types";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { GitHubIcon, GitLabIcon, JiraIcon, LinearIcon } from "../Icons";
import { MultiStepWizardFrame } from "./MultiStepWizardFrame";
import {
  buildProjectAutomationExecutionLabel,
  buildProjectAutomationPromptPreview,
  type AutomationWorkspaceMode,
} from "~/projectAutomations";
import {
  buildProjectTriggerEventLabel,
  buildProjectTriggerPromptPreview,
  createProjectTrigger,
  type ProjectTrigger,
  type ProjectTriggerEvent,
} from "~/projectTriggers";
import type { SourceControlRepositoryInfo } from "@t3tools/contracts";
import type { ComponentType } from "react";

const INTEGRATION_ICON_BY_KIND: Record<IntegrationKind, ComponentType<{ className?: string }>> = {
  github: GitHubIcon,
  gitlab: GitLabIcon,
  jira: JiraIcon,
  linear: LinearIcon,
};

const SUPPORTED_TRIGGER_INTEGRATIONS = new Set<IntegrationKind>(["github"]);

const extendReplacementRangeForTrailingSpace = (
  text: string,
  rangeEnd: number,
  replacement: string,
): number => {
  if (!replacement.endsWith(" ")) {
    return rangeEnd;
  }
  return text[rangeEnd] === " " ? rangeEnd + 1 : rangeEnd;
};

function repositoryInfoFromNameWithOwner(nameWithOwner: string): SourceControlRepositoryInfo {
  return {
    provider: "github",
    nameWithOwner,
    url: `https://github.com/${nameWithOwner}`,
    sshUrl: `git@github.com:${nameWithOwner}.git`,
  };
}

function repositoryQueryFromProject(project: Project | null): string {
  const identity = project?.repositoryIdentity;
  if (!identity) return "";
  const provider = identity.provider?.trim().toLowerCase();
  if (provider && provider !== "github") return "";
  const owner = identity.owner?.trim();
  const name = identity.name?.trim();
  if (!owner || !name) return "";
  return `${owner}/${name}`;
}

function repositoryNameWithOwner(
  repository: SourceControlRepositoryInfo | null,
  query: string,
): string {
  if (repository) return repository.nameWithOwner;
  return query.trim();
}

function deriveTriggerTitle(input: { repository: string; event: ProjectTriggerEvent }): string {
  const repository = input.repository.trim();
  const event = buildProjectTriggerEventLabel(input.event);
  if (repository.length === 0) {
    return event;
  }
  return `${event} · ${repository}`;
}

interface TriggerWizardDialogProps {
  open: boolean;
  project: Project | null;
  onOpenChange: (open: boolean) => void;
  onCreateTrigger: (trigger: ProjectTrigger) => void;
}

export function TriggerWizardDialog({
  open,
  project,
  onOpenChange,
  onCreateTrigger,
}: TriggerWizardDialogProps) {
  const providerSnapshots = useAtomValue(primaryServerProvidersAtom);
  const providerInstanceEntries = useMemo(
    () => deriveProviderInstanceEntries(providerSnapshots),
    [providerSnapshots],
  );
  const { resolvedTheme } = useTheme();
  const clientSettings = useClientSettings();
  const settingsIntegrations = usePrimarySettings((settings) => settings.integrations);
  const slashCommands = useMemo(() => {
    const commands = collectComposerSlashCommands(providerSnapshots, {
      hiddenSlashCommandsByProvider: clientSettings.hiddenProviderSlashCommands,
      customSlashCommands: clientSettings.customSlashCommands,
    });
    return filterComposerSlashCommandsForAutocomplete(commands, {
      hiddenCustomSlashCommands: clientSettings.hiddenCustomSlashCommands,
      hiddenGlobalSlashCommands: clientSettings.hiddenGlobalSlashCommands,
    });
  }, [
    clientSettings.customSlashCommands,
    clientSettings.hiddenCustomSlashCommands,
    clientSettings.hiddenGlobalSlashCommands,
    clientSettings.hiddenProviderSlashCommands,
    providerSnapshots,
  ]);
  const slashCommandSkills = useMemo(
    () => providerSnapshots.flatMap((provider) => provider.skills),
    [providerSnapshots],
  );

  const [step, setStep] = useState(0);
  const [integrationKind, setIntegrationKind] = useState<IntegrationKind>("github");
  const [accountId, setAccountId] = useState("");
  const [repositorySearch, setRepositorySearch] = useState("");
  const [repositoryQuery, setRepositoryQuery] = useState("");
  const [event, setEvent] = useState<ProjectTriggerEvent>("pull-request-opened");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [promptCursor, setPromptCursor] = useState(0);
  const [promptTrigger, setPromptTrigger] = useState<ComposerTrigger | null>(null);
  const [promptHighlightedItemId, setPromptHighlightedItemId] = useState<string | null>(null);
  const [autoArchiveThread, setAutoArchiveThread] = useState(true);
  const [workspaceMode, setWorkspaceMode] = useState<AutomationWorkspaceMode>("new-worktree");
  const [branchName, setBranchName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptEditorRef = useRef<ComposerPromptEditorHandle>(null);
  const promptMenuOpenRef = useRef(false);
  const promptMenuItemsRef = useRef<ComposerCommandItem[]>([]);
  const activePromptMenuItemRef = useRef<ComposerCommandItem | null>(null);
  const promptSelectLockRef = useRef(false);

  const accounts = useMemo(
    () => ({
      github: settingsIntegrations.github ?? [],
      gitlab: settingsIntegrations.gitlab ?? [],
      jira: settingsIntegrations.jira ?? [],
      linear: settingsIntegrations.linear ?? [],
    }),
    [settingsIntegrations],
  );
  const selectedIntegrationAccounts = accounts[integrationKind] ?? [];

  const selectedAccount =
    selectedIntegrationAccounts.find((account) => account.id === accountId) ?? null;

  const repositoryListingTarget = useMemo(() => {
    if (!project || !selectedAccount || integrationKind !== "github") {
      return null;
    }
    return {
      environmentId: project.environmentId,
      input: {
        kind: integrationKind,
        accountId: selectedAccount.id,
        useStoredToken: true,
      },
    };
  }, [integrationKind, project, selectedAccount]);

  const repositoryListing = useEnvironmentQuery(
    repositoryListingTarget
      ? serverEnvironment.listIntegrationRepositories(repositoryListingTarget)
      : null,
  );

  useEffect(() => {
    if (!repositoryListingTarget) {
      console.log("[trigger-wizard] repository lookup inactive", {
        projectId: project?.id ?? null,
        integrationKind,
        accountId,
        useStoredToken: true,
      });
      return;
    }

    console.log("[trigger-wizard] repository lookup requested", {
      projectId: project?.id ?? null,
      environmentId: repositoryListingTarget.environmentId,
      integrationKind: repositoryListingTarget.input.kind,
      accountId: repositoryListingTarget.input.accountId,
      repositoryCount: repositoryListing.data?.length ?? null,
      isPending: repositoryListing.isPending,
      hasError: repositoryListing.error !== null,
    });
  }, [
    accountId,
    integrationKind,
    project?.id,
    repositoryListing.data?.length,
    repositoryListing.error,
    repositoryListing.isPending,
    repositoryListingTarget,
  ]);

  useEffect(() => {
    if (!repositoryListing.error) return;
    const error = repositoryListing.error as { name?: string; message?: string } | null;
    console.error("[trigger-wizard] repository lookup failed", {
      projectId: project?.id ?? null,
      environmentId: repositoryListingTarget?.environmentId ?? null,
      integrationKind,
      accountId,
      errorName: error?.name ?? typeof repositoryListing.error,
      errorMessage: error?.message ?? String(repositoryListing.error),
      error: repositoryListing.error,
    });

    const maybeRpcError = repositoryListing.error as {
      readonly cause?: unknown;
      readonly error?: unknown;
      readonly message?: string;
    };
    if (maybeRpcError.cause !== undefined) {
      console.error("[trigger-wizard] repository lookup rpc cause", maybeRpcError.cause);
    }
    if (maybeRpcError.error !== undefined) {
      console.error("[trigger-wizard] repository lookup rpc error", maybeRpcError.error);
    }
  }, [accountId, integrationKind, project?.id, repositoryListing.error, repositoryListingTarget]);

  const repositoryOptions = repositoryListing.data ?? [];
  const normalizedRepositorySearch = repositorySearch.trim().toLowerCase();
  const filteredRepositoryOptions = useMemo(() => {
    if (normalizedRepositorySearch.length === 0) {
      return repositoryOptions;
    }
    return repositoryOptions.filter((repository) =>
      `${repository.nameWithOwner} ${repository.url} ${repository.sshUrl}`
        .toLowerCase()
        .includes(normalizedRepositorySearch),
    );
  }, [normalizedRepositorySearch, repositoryOptions]);

  const selectedRepository = useMemo(
    () =>
      repositoryOptions.find((repository) => repository.nameWithOwner === repositoryQuery.trim()) ??
      null,
    [repositoryOptions, repositoryQuery],
  );
  const selectedRepositoryName = repositoryNameWithOwner(selectedRepository, repositoryQuery);

  const defaultRepositoryQuery = useMemo(() => {
    const projectRepository = repositoryQueryFromProject(project);
    if (projectRepository.length > 0) {
      return projectRepository;
    }
    return repositoryOptions[0]?.nameWithOwner ?? "";
  }, [project, repositoryOptions]);

  const executionSummary = buildProjectAutomationExecutionLabel({
    archiveThread: autoArchiveThread,
    workspaceMode,
    ...(workspaceMode === "main-branch" && branchName.trim().length > 0
      ? { branchName: branchName.trim() }
      : {}),
  });

  const promptMenuItems = useMemo<ComposerCommandItem[]>(() => {
    if (!promptTrigger || promptTrigger.kind !== "slash-command") return [];
    const slashCommandItems = buildComposerSlashCommandItems(
      providerInstanceEntries,
      clientSettings.hiddenProviderSlashCommands,
      clientSettings.customSlashCommands,
      clientSettings.hiddenCustomSlashCommands,
      clientSettings.hiddenGlobalSlashCommands,
    );
    return searchSlashCommandItems(slashCommandItems, promptTrigger.query);
  }, [
    clientSettings.customSlashCommands,
    clientSettings.hiddenCustomSlashCommands,
    clientSettings.hiddenGlobalSlashCommands,
    clientSettings.hiddenProviderSlashCommands,
    promptTrigger,
    providerInstanceEntries,
  ]);
  const promptMenuOpen = Boolean(promptTrigger?.kind === "slash-command");
  const activePromptMenuItem = useMemo(() => {
    if (promptMenuItems.length === 0) return null;
    return (
      promptMenuItems.find((item) => item.id === promptHighlightedItemId) ?? promptMenuItems[0]
    );
  }, [promptHighlightedItemId, promptMenuItems]);

  promptMenuOpenRef.current = promptMenuOpen;
  promptMenuItemsRef.current = promptMenuItems;
  activePromptMenuItemRef.current = activePromptMenuItem ?? null;

  const canAdvanceFromIntegration = SUPPORTED_TRIGGER_INTEGRATIONS.has(integrationKind);
  const canAdvanceFromAccount = selectedAccount !== null;
  const canAdvanceFromRepository = repositoryQuery.trim().length > 0;
  const canAdvanceFromPrompt = title.trim().length > 0 && prompt.trim().length > 0;
  const canAdvanceFromExecution = workspaceMode === "new-worktree" || branchName.trim().length > 0;
  const reviewTitle =
    title.trim().length > 0
      ? title.trim()
      : deriveTriggerTitle({ repository: selectedRepositoryName, event });
  const promptPreview = buildProjectAutomationPromptPreview(prompt);
  const previousStep = useCallback(() => setStep((current) => Math.max(0, current - 1)), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!SUPPORTED_TRIGGER_INTEGRATIONS.has(integrationKind)) {
      setIntegrationKind("github");
    }
  }, [integrationKind, open]);

  useEffect(() => {
    if (!open) return;
    const nextAccountId = selectedIntegrationAccounts[0]?.id ?? "";
    if (
      nextAccountId.length > 0 &&
      !selectedIntegrationAccounts.some((account) => account.id === accountId)
    ) {
      setAccountId(nextAccountId);
    }
    if (accountId.length === 0 && nextAccountId.length > 0) {
      setAccountId(nextAccountId);
    }
  }, [accountId, open, selectedIntegrationAccounts]);

  useEffect(() => {
    if (!open) return;
    if (repositoryQuery.length === 0 && defaultRepositoryQuery.length > 0) {
      setRepositoryQuery(defaultRepositoryQuery);
    }
  }, [defaultRepositoryQuery, open, repositoryQuery.length]);

  useEffect(() => {
    if (!open) return;
    if (!titleTouched && title.trim().length === 0) {
      setTitle(deriveTriggerTitle({ repository: selectedRepositoryName, event }));
    }
  }, [event, open, selectedRepositoryName, title, titleTouched]);

  useEffect(() => {
    if (open) return;
    setStep(0);
    setIntegrationKind("github");
    setAccountId("");
    setRepositorySearch("");
    setRepositoryQuery("");
    setEvent("pull-request-opened");
    setTitle("");
    setTitleTouched(false);
    setPrompt("");
    setPromptCursor(0);
    setPromptTrigger(null);
    setPromptHighlightedItemId(null);
    setAutoArchiveThread(true);
    setWorkspaceMode("new-worktree");
    setBranchName("");
    setIsSubmitting(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      if (step === 4) {
        promptEditorRef.current?.focusAtEnd();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, step]);

  const resolveActivePromptTrigger = useCallback((): {
    snapshot: { value: string; cursor: number; expandedCursor: number };
    trigger: ComposerTrigger | null;
  } => {
    const snapshot = promptEditorRef.current?.readSnapshot() ?? {
      value: prompt,
      cursor: promptCursor,
      expandedCursor: promptCursor,
    };
    return {
      snapshot,
      trigger: detectComposerTrigger(snapshot.value, snapshot.expandedCursor),
    };
  }, [prompt, promptCursor]);

  const onSelectPromptItem = useCallback(
    (item: ComposerCommandItem) => {
      if (promptSelectLockRef.current) return;
      promptSelectLockRef.current = true;
      window.requestAnimationFrame(() => {
        promptSelectLockRef.current = false;
      });

      const { snapshot, trigger } = resolveActivePromptTrigger();
      if (!trigger) return;

      if (item.type === "slash-command") {
        const replacement = `/${item.command} `;
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = replaceTextRange(
          snapshot.value,
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
        );
        setPrompt(applied.text);
        setPromptCursor(applied.cursor);
        setPromptTrigger(detectComposerTrigger(applied.text, applied.cursor));
        setPromptHighlightedItemId(null);
        return;
      }

      if (item.type === "provider-slash-command" || item.type === "custom-slash-command") {
        const replacement = `/${item.command.name} `;
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = replaceTextRange(
          snapshot.value,
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
        );
        setPrompt(applied.text);
        setPromptCursor(applied.cursor);
        setPromptTrigger(detectComposerTrigger(applied.text, applied.cursor));
        setPromptHighlightedItemId(null);
      }
    },
    [resolveActivePromptTrigger],
  );

  const onPromptCommandKey = useCallback(
    (key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab", event: KeyboardEvent) => {
      const menuIsActive = promptMenuOpenRef.current || promptTrigger !== null;
      if (!menuIsActive) {
        return false;
      }
      const currentItems = promptMenuItemsRef.current;
      const selectedItem = activePromptMenuItemRef.current ?? currentItems[0];
      if (key === "ArrowDown" && currentItems.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        const currentIndex = currentItems.findIndex((item) => item.id === promptHighlightedItemId);
        const nextIndex = (currentIndex + 1 + currentItems.length) % currentItems.length;
        setPromptHighlightedItemId(currentItems[nextIndex]?.id ?? null);
        return true;
      }
      if (key === "ArrowUp" && currentItems.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        const currentIndex = currentItems.findIndex((item) => item.id === promptHighlightedItemId);
        const nextIndex = (currentIndex - 1 + currentItems.length) % currentItems.length;
        setPromptHighlightedItemId(currentItems[nextIndex]?.id ?? null);
        return true;
      }
      if ((key === "Enter" || key === "Tab") && selectedItem) {
        event.preventDefault();
        event.stopPropagation();
        onSelectPromptItem(selectedItem);
        return true;
      }
      return false;
    },
    [onSelectPromptItem, promptHighlightedItemId, promptTrigger],
  );

  const onPromptChange = useCallback(
    (
      nextValue: string,
      nextCursor: number,
      expandedCursor: number,
      cursorAdjacentToMention: boolean,
      terminalContextIds: string[],
    ) => {
      setPrompt(nextValue);
      setPromptCursor(nextCursor);
      setPromptTrigger(
        cursorAdjacentToMention ? null : detectComposerTrigger(nextValue, expandedCursor),
      );
      setPromptHighlightedItemId(null);
      void terminalContextIds;
    },
    [],
  );

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleCreateTrigger = useCallback(async () => {
    if (!project || !selectedAccount || repositoryQuery.trim().length === 0) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const repository =
        selectedRepository ?? repositoryInfoFromNameWithOwner(repositoryQuery.trim());
      const trigger = createProjectTrigger({
        integrationKind,
        accountId: selectedAccount.id,
        repository: {
          provider: repository.provider,
          nameWithOwner: repository.nameWithOwner,
          url: repository.url,
          sshUrl: repository.sshUrl,
        },
        event,
        title: title.trim(),
        prompt: prompt.trim(),
        execution: {
          archiveThread: autoArchiveThread,
          workspaceMode,
          ...(workspaceMode === "main-branch" && branchName.trim().length > 0
            ? { branchName: branchName.trim() }
            : {}),
        },
      });
      onCreateTrigger(trigger);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trigger.");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    accountId,
    autoArchiveThread,
    branchName,
    event,
    integrationKind,
    onCreateTrigger,
    onOpenChange,
    project,
    prompt,
    repositoryQuery,
    selectedAccount,
    selectedRepository,
    title,
    workspaceMode,
  ]);

  const steps = ["Integration", "Account", "Repository", "Event", "Prompt", "Execution", "Review"];

  const repositoryCountLabel = repositoryListing.isPending
    ? "Loading repositories…"
    : `${filteredRepositoryOptions.length} repo${filteredRepositoryOptions.length === 1 ? "" : "s"}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
          return;
        }
        onOpenChange(false);
      }}
    >
      <DialogPopup className="max-w-4xl">
        <MultiStepWizardFrame
          title="Create trigger"
          description="Build a project-scoped trigger. Use shared slash commands in the prompt step."
          steps={steps}
          activeStep={step}
          onStepClick={(index) => {
            if (index <= step) {
              setStep(index);
            }
          }}
          error={error}
          onCancel={handleClose}
          onBack={previousStep}
          onNext={() => setStep((current) => Math.min(6, current + 1))}
          onConfirm={() => void handleCreateTrigger()}
          canGoBack={step > 0}
          canGoNext={step < 6}
          nextLabel="Next"
          nextDisabled={
            (step === 0 && !canAdvanceFromIntegration) ||
            (step === 1 && !canAdvanceFromAccount) ||
            (step === 2 && !canAdvanceFromRepository) ||
            (step === 4 && !canAdvanceFromPrompt) ||
            (step === 5 && !canAdvanceFromExecution)
          }
          confirmLabel="Add"
          isConfirming={isSubmitting}
        >
          {step === 0 ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Choose integration</p>
                <p className="text-xs text-muted-foreground">
                  Pick the integration that should drive this trigger.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {INTEGRATION_KINDS.map((kind) => {
                  const Icon = INTEGRATION_ICON_BY_KIND[kind];
                  const supported = SUPPORTED_TRIGGER_INTEGRATIONS.has(kind);
                  const accountCount = accounts[kind]?.length ?? 0;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => {
                        setIntegrationKind(kind);
                        setAccountId(accounts[kind]?.[0]?.id ?? "");
                      }}
                      disabled={!supported}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
                        integrationKind === kind
                          ? "border-primary/40 bg-primary/10"
                          : "border-border/70 bg-background/70 hover:bg-muted/30",
                        !supported && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <Icon className="size-5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{INTEGRATION_DISPLAY_NAMES[kind]}</p>
                        <p className="text-xs text-muted-foreground">
                          {accountCount > 0
                            ? `${accountCount} account${accountCount === 1 ? "" : "s"}`
                            : supported
                              ? "No accounts configured"
                              : "Coming soon"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Choose account</p>
                <p className="text-xs text-muted-foreground">
                  Select the integration account that should execute the trigger.
                </p>
              </div>
              <div className="grid gap-2">
                {selectedIntegrationAccounts.length > 0 ? (
                  selectedIntegrationAccounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setAccountId(account.id)}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors",
                        accountId === account.id
                          ? "border-primary/40 bg-primary/10"
                          : "border-border/70 bg-background/70 hover:bg-muted/30",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{account.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{account.name}</p>
                        </div>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {accountId === account.id ? "Selected" : "Use"}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                    No accounts are configured for {INTEGRATION_DISPLAY_NAMES[integrationKind]}.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Select repository</p>
                <p className="text-xs text-muted-foreground">
                  Repo picker uses the selected account token and shows every accessible repo.
                </p>
              </div>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Search repos</span>
                <Input
                  value={repositorySearch}
                  onChange={(event) => setRepositorySearch(event.target.value)}
                  placeholder="Search repositories"
                />
              </label>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{repositoryCountLabel}</span>
                <span>Default: {defaultRepositoryQuery || "none yet"}</span>
              </div>
              <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-border/70 bg-muted/10 p-2">
                {repositoryListing.isPending ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Loading repositories…
                  </div>
                ) : filteredRepositoryOptions.length > 0 ? (
                  filteredRepositoryOptions.map((repository) => {
                    const active = repository.nameWithOwner === repositoryQuery.trim();
                    return (
                      <button
                        key={repository.nameWithOwner}
                        type="button"
                        onClick={() => setRepositoryQuery(repository.nameWithOwner)}
                        className={cn(
                          "flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                          active
                            ? "border-primary/40 bg-primary/10"
                            : "border-transparent bg-background/80 hover:border-border/70 hover:bg-muted/30",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{repository.nameWithOwner}</p>
                          <p className="truncate text-xs text-muted-foreground">{repository.url}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {active ? "Selected" : "Use"}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No repositories match your search.
                  </div>
                )}
              </div>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Override repo</span>
                <Input
                  value={repositoryQuery}
                  onChange={(event) => setRepositoryQuery(event.target.value)}
                  placeholder="owner/repo"
                />
              </label>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Choose event</p>
                <p className="text-xs text-muted-foreground">
                  Pick the repository event that should launch the trigger.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  {
                    value: "pull-request-opened" as const,
                    label: "PR opened",
                    description: "Trigger when a pull request opens.",
                  },
                  {
                    value: "pull-request-merged" as const,
                    label: "PR merged",
                    description: "Trigger when a pull request merges.",
                  },
                  {
                    value: "issue-created" as const,
                    label: "Issue created",
                    description: "Trigger when a new issue is created.",
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setEvent(option.value)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors",
                      event === option.value
                        ? "border-primary/40 bg-primary/10"
                        : "border-border/70 bg-background/70 hover:bg-muted/30",
                    )}
                  >
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Title and prompt</p>
                <p className="text-xs text-muted-foreground">
                  Add a name and describe what the trigger should do.
                </p>
              </div>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Title</span>
                <Input
                  value={title}
                  onChange={(event) => {
                    setTitleTouched(true);
                    setTitle(event.target.value);
                  }}
                  placeholder={deriveTriggerTitle({ repository: selectedRepositoryName, event })}
                />
              </label>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Prompt</span>
                  <span className="text-xs text-muted-foreground">
                    {buildProjectTriggerPromptPreview(prompt)}
                  </span>
                </div>
                <div className="relative">
                  {promptMenuOpen ? (
                    <div className="absolute right-0 bottom-full z-20 mb-2 w-full max-w-lg">
                      <ComposerCommandMenu
                        items={promptMenuItems}
                        resolvedTheme={resolvedTheme}
                        isLoading={false}
                        triggerKind={promptTrigger?.kind ?? null}
                        groupSlashCommandSections={promptTrigger?.kind === "slash-command"}
                        emptyStateText="No commands match the current query."
                        activeItemId={promptHighlightedItemId}
                        onHighlightedItemChange={setPromptHighlightedItemId}
                        onSelect={onSelectPromptItem}
                      />
                    </div>
                  ) : null}
                  <ComposerPromptEditor
                    value={prompt}
                    cursor={promptCursor}
                    terminalContexts={[]}
                    skills={slashCommandSkills}
                    slashCommands={slashCommands}
                    disabled={false}
                    placeholder="Describe what should happen when the trigger fires..."
                    className="min-h-40"
                    onRemoveTerminalContext={() => undefined}
                    onChange={onPromptChange}
                    onCommandKeyDown={onPromptCommandKey}
                    onPaste={() => undefined}
                    editorRef={promptEditorRef}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Thread behavior</p>
                <p className="text-xs text-muted-foreground">
                  Choose how the trigger should manage the thread and workspace.
                </p>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/18 px-4 py-3 text-sm">
                <div className="space-y-1">
                  <p className="font-medium">Auto-archive thread</p>
                  <p className="text-xs text-muted-foreground">
                    Archive the thread automatically after the trigger run finishes.
                  </p>
                </div>
                <Switch checked={autoArchiveThread} onCheckedChange={setAutoArchiveThread} />
              </label>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Workspace</p>
                  <p className="text-xs text-muted-foreground">
                    Pick a fresh worktree or run on the main checkout with a branch.
                  </p>
                </div>
                <RadioGroup
                  value={workspaceMode}
                  onValueChange={(value) => setWorkspaceMode(value as AutomationWorkspaceMode)}
                  className="grid gap-2"
                >
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-background px-4 py-3 text-sm transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="new-worktree" />
                    <div className="space-y-1">
                      <p className="font-medium">New worktree</p>
                      <p className="text-xs text-muted-foreground">
                        Create an isolated worktree for each trigger run.
                      </p>
                    </div>
                  </label>
                  <div className="space-y-3 rounded-xl border border-border/70 bg-background px-4 py-3 text-sm transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
                    <label className="flex cursor-pointer items-start gap-3">
                      <RadioGroupItem value="main-branch" />
                      <div className="space-y-1">
                        <p className="font-medium">Main worktree on a branch</p>
                        <p className="text-xs text-muted-foreground">
                          Run directly in the main checkout on a specific branch.
                        </p>
                      </div>
                    </label>
                    {workspaceMode === "main-branch" ? (
                      <label className="grid gap-1.5 pl-7">
                        <span className="text-xs font-medium text-foreground">Branch name</span>
                        <Input
                          value={branchName}
                          onChange={(event) => setBranchName(event.target.value)}
                          placeholder="main"
                        />
                      </label>
                    ) : null}
                  </div>
                </RadioGroup>
              </div>
            </div>
          ) : null}

          {step === 6 ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Review and confirm</p>
                <p className="text-xs text-muted-foreground">
                  Check the details, then add the trigger.
                </p>
              </div>
              <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/18 p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Integration</span>
                  <span className="text-right font-medium">
                    {INTEGRATION_DISPLAY_NAMES[integrationKind]}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Account</span>
                  <span className="text-right font-medium">{selectedAccount?.name ?? "None"}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Repository</span>
                  <span className="text-right font-medium">{selectedRepositoryName}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Event</span>
                  <span className="text-right font-medium">
                    {buildProjectTriggerEventLabel(event)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Title</span>
                  <span className="max-w-[20rem] text-right font-medium">{reviewTitle}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Prompt</span>
                  <span className="max-w-[20rem] text-right text-muted-foreground">
                    {promptPreview || "No prompt set"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Thread behavior</span>
                  <span className="max-w-[20rem] text-right text-muted-foreground">
                    {executionSummary}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </MultiStepWizardFrame>
      </DialogPopup>
    </Dialog>
  );
}
