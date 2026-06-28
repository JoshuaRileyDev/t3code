import { useAtomCommand } from "../../state/use-atom-command";
import { useProject } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { usePaginatedBranches } from "../../state/queries";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, Settings2Icon } from "lucide-react";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { Button } from "../ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
} from "../ui/combobox";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
  SettingResetButton,
} from "./settingsLayout";

const AUTOMATIC_BASE_BRANCH_VALUE = "__automatic__";

export function ProjectSettingsPanel({
  environmentId,
  projectId,
}: {
  environmentId: EnvironmentId;
  projectId: ProjectId;
}) {
  const project = useProject({ environmentId, projectId });
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const [isSaving, setIsSaving] = useState(false);
  const [threadEnvMode, setThreadEnvMode] = useState<"local" | "worktree">("local");
  const [baseBranch, setBaseBranch] = useState<string | null>(null);
  const [branchQuery, setBranchQuery] = useState("");

  useEffect(() => {
    if (!project) return;
    setThreadEnvMode(project.defaultThreadEnvMode ?? "local");
    setBaseBranch(project.defaultWorktreeBaseBranch ?? null);
  }, [project]);

  const branchRefState = usePaginatedBranches({
    environmentId,
    cwd: project?.workspaceRoot ?? null,
    query: branchQuery,
  });
  const branchNames = useMemo(() => branchRefState.refs.map((ref) => ref.name), [branchRefState]);
  const branchByName = useMemo(
    () => new Map(branchNames.map((name) => [name, true] as const)),
    [branchNames],
  );
  const selectedBaseBranch = baseBranch ?? AUTOMATIC_BASE_BRANCH_VALUE;
  const customBaseBranchItemValue =
    branchQuery.trim().length > 0 && !branchByName.has(branchQuery.trim())
      ? `__custom__:${branchQuery.trim()}`
      : null;
  const branchItems = useMemo(() => {
    const items = [AUTOMATIC_BASE_BRANCH_VALUE, ...branchNames];
    if (customBaseBranchItemValue) {
      items.unshift(customBaseBranchItemValue);
    }
    return items;
  }, [branchNames, customBaseBranchItemValue]);

  const hasChanges =
    project !== null &&
    (threadEnvMode !== (project.defaultThreadEnvMode ?? "local") ||
      (baseBranch ?? null) !== (project.defaultWorktreeBaseBranch ?? null));

  const saveProjectSettings = useCallback(async () => {
    if (!project || !hasChanges) return;
    setIsSaving(true);
    try {
      await updateProject({
        environmentId,
        input: {
          projectId,
          defaultThreadEnvMode: threadEnvMode,
          defaultWorktreeBaseBranch: baseBranch,
        },
      });
    } finally {
      setIsSaving(false);
    }
  }, [baseBranch, environmentId, hasChanges, project, projectId, threadEnvMode, updateProject]);

  if (!project) {
    return (
      <SettingsPageContainer>
        <SettingsSection title="Project settings" icon={<Settings2Icon className="size-3.5" />}>
          <div className="px-5 py-4 text-sm text-muted-foreground">Project not found.</div>
        </SettingsSection>
      </SettingsPageContainer>
    );
  }

  return (
    <SettingsPageContainer>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Project settings</h1>
        <p className="text-sm text-muted-foreground">
          {project.title} · {project.workspaceRoot}
        </p>
      </div>

      <SettingsSection title="Workspace" icon={<Settings2Icon className="size-3.5" />}>
        <SettingsRow
          title="Default workspace mode"
          description="Choose whether new threads in this project should start in the current checkout or a new worktree."
          control={
            <Select
              value={threadEnvMode}
              onValueChange={(value) => {
                if (value === "local" || value === "worktree") {
                  setThreadEnvMode(value);
                }
              }}
            >
              <SelectTrigger className="min-w-44" aria-label="Default workspace mode">
                <SelectValue>
                  {threadEnvMode === "worktree" ? "New worktree" : "Current checkout"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end">
                <SelectItem hideIndicator value="local">
                  Current checkout
                </SelectItem>
                <SelectItem hideIndicator value="worktree">
                  New worktree
                </SelectItem>
              </SelectPopup>
            </Select>
          }
          resetAction={
            threadEnvMode !== "local" ? (
              <SettingResetButton
                label="default workspace mode"
                onClick={() => setThreadEnvMode("local")}
              />
            ) : null
          }
        />

        <SettingsRow
          title="Default worktree base branch"
          description="When a new worktree is created for this project, branch from this ref instead of the current branch."
          control={
            <Combobox
              items={branchItems}
              filteredItems={branchItems.filter((item) =>
                branchQuery.trim().length === 0
                  ? true
                  : item.toLowerCase().includes(branchQuery.trim().toLowerCase()),
              )}
              value={selectedBaseBranch}
              onValueChange={(value) => {
                if (value === null) {
                  return;
                }
                if (value === AUTOMATIC_BASE_BRANCH_VALUE) {
                  setBaseBranch(null);
                  return;
                }
                if (value.startsWith("__custom__:")) {
                  setBaseBranch(value.slice("__custom__:".length));
                  return;
                }
                setBaseBranch(value);
              }}
            >
              <ComboboxTrigger className="inline-flex min-w-52 items-center justify-between gap-2 rounded-lg border bg-popover px-3 py-2 text-sm">
                <span className="truncate">
                  {baseBranch ?? "Automatic from the current branch"}
                </span>
                <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" />
              </ComboboxTrigger>
              <ComboboxPopup className="w-[min(28rem,calc(100vw-2rem))]">
                <div className="px-3 pt-2.5">
                  <ComboboxInput
                    className="[&_input]:h-8 [&_input]:font-sans"
                    inputClassName="rounded-md"
                    placeholder="Search refs"
                    showTrigger={false}
                    size="sm"
                    unstyled
                    value={branchQuery}
                    onChange={(event) => setBranchQuery(event.target.value)}
                  />
                </div>
                <ComboboxEmpty>No matching refs.</ComboboxEmpty>
                <ComboboxList className="max-h-72 min-w-0 overflow-x-hidden">
                  <ComboboxItem value={AUTOMATIC_BASE_BRANCH_VALUE} hideIndicator>
                    Automatic
                  </ComboboxItem>
                  {branchQuery.trim().length > 0 && !branchByName.has(branchQuery.trim()) ? (
                    <ComboboxItem value={`__custom__:${branchQuery.trim()}`} hideIndicator>
                      Use “{branchQuery.trim()}”
                    </ComboboxItem>
                  ) : null}
                  {branchNames.map((name) => (
                    <ComboboxItem key={name} value={name}>
                      {name}
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxPopup>
            </Combobox>
          }
          resetAction={
            baseBranch !== null ? (
              <SettingResetButton
                label="default worktree base branch"
                onClick={() => setBaseBranch(null)}
              />
            ) : null
          }
          status={
            <span className="text-xs text-muted-foreground">
              {baseBranch
                ? `Saved as ${baseBranch}`
                : "Uses the current branch when no default is set."}
            </span>
          }
        />

        <div className="flex items-center justify-between px-5 py-4">
          <div className="text-xs text-muted-foreground">
            {hasChanges ? "Unsaved changes." : "All changes saved."}
          </div>
          <Button disabled={!hasChanges || isSaving} onClick={() => void saveProjectSettings()}>
            Save changes
          </Button>
        </div>
      </SettingsSection>
    </SettingsPageContainer>
  );
}
