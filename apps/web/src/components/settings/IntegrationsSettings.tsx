import { useEffect, useMemo, useState } from "react";
import { PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { readEnvironmentApi } from "../../environmentApi";
import { ensureLocalApi } from "../../localApi";
import { newCommandId } from "../../lib/utils";
import { selectProjectsAcrossEnvironments, useStore } from "../../store";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

type LinearAccount = Awaited<
  ReturnType<ReturnType<typeof ensureLocalApi>["server"]["listLinearAccounts"]>
>[number];
type LinearProject = Awaited<
  ReturnType<ReturnType<typeof ensureLocalApi>["server"]["listLinearProjects"]>
>[number];
type LinearTeam = Awaited<
  ReturnType<ReturnType<typeof ensureLocalApi>["server"]["listLinearTeams"]>
>[number];
type LinearMapping = Awaited<
  ReturnType<ReturnType<typeof ensureLocalApi>["server"]["listLinearMappings"]>
>[number];
type LinearReviewMapping = Awaited<
  ReturnType<ReturnType<typeof ensureLocalApi>["server"]["listLinearTeamReviewStateMappings"]>
>[number];

function ProjectBaseBranchSettings() {
  const projects = useStore(useShallow(selectProjectsAcrossEnvironments));
  const [pendingByProjectId, setPendingByProjectId] = useState<Record<string, string>>({});

  useEffect(() => {
    setPendingByProjectId((current) => {
      const next: Record<string, string> = {};
      for (const project of projects) {
        next[project.id] = current[project.id] ?? project.defaultPrBaseBranch ?? "";
      }
      return next;
    });
  }, [projects]);

  const saveProjectBranch = async (projectId: string) => {
    const project = projects.find((entry) => entry.id === projectId);
    if (!project) return;

    const api = readEnvironmentApi(project.environmentId);
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Environment unavailable",
        description: `Could not access environment for project ${project.name}.`,
      });
      return;
    }

    const value = pendingByProjectId[projectId]?.trim() ?? "";

    await api.orchestration.dispatchCommand({
      type: "project.meta.update",
      commandId: newCommandId(),
      projectId: project.id,
      defaultPrBaseBranch: value.length > 0 ? value : null,
    });

    toastManager.add({
      type: "success",
      title: "Project updated",
      description: `Saved default PR base branch for ${project.name}.`,
    });
  };

  return (
    <SettingsSection title="Project Defaults">
      {projects.length === 0 ? (
        <SettingsRow
          title="No projects"
          description="Add at least one project to configure default PR target branches."
        />
      ) : (
        projects.map((project) => (
          <SettingsRow
            key={`${project.environmentId}:${project.id}`}
            title={project.name}
            description={project.cwd}
            control={
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <Input
                  className="h-8 w-full sm:w-56"
                  placeholder="main"
                  value={pendingByProjectId[project.id] ?? ""}
                  onChange={(event) =>
                    setPendingByProjectId((current) => ({
                      ...current,
                      [project.id]: event.target.value,
                    }))
                  }
                />
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void saveProjectBranch(project.id)}
                >
                  Save
                </Button>
              </div>
            }
          />
        ))
      )}
    </SettingsSection>
  );
}

export function IntegrationsSettings() {
  const localApi = ensureLocalApi();
  const projects = useStore(useShallow(selectProjectsAcrossEnvironments));

  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<LinearAccount[]>([]);
  const [mappings, setMappings] = useState<LinearMapping[]>([]);
  const [reviewMappings, setReviewMappings] = useState<LinearReviewMapping[]>([]);

  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountApiKey, setNewAccountApiKey] = useState("");

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [availableLinearProjects, setAvailableLinearProjects] = useState<LinearProject[]>([]);
  const [availableLinearTeams, setAvailableLinearTeams] = useState<LinearTeam[]>([]);

  const [selectedLinearProjectId, setSelectedLinearProjectId] = useState<string | null>(null);
  const [selectedAppProjectKey, setSelectedAppProjectKey] = useState<string | null>(null);

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [reviewStateId, setReviewStateId] = useState("");

  const appProjectOptions = useMemo(
    () =>
      projects.map((project) => ({
        key: `${project.environmentId}:${project.id}`,
        label: project.name,
        environmentId: project.environmentId,
        projectId: project.id,
      })),
    [projects],
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const [nextAccounts, nextMappings, nextReviewMappings] = await Promise.all([
        localApi.server.listLinearAccounts(),
        localApi.server.listLinearMappings(),
        localApi.server.listLinearTeamReviewStateMappings(),
      ]);
      setAccounts(nextAccounts);
      setMappings(nextMappings);
      setReviewMappings(nextReviewMappings);
      setSelectedAccountId((current) =>
        current && nextAccounts.some((entry) => entry.id === current)
          ? current
          : (nextAccounts[0]?.id ?? null),
      );
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to load integrations",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!selectedAccountId) {
      setAvailableLinearProjects([]);
      setAvailableLinearTeams([]);
      return;
    }

    let disposed = false;
    void Promise.all([
      localApi.server.listLinearProjects({ accountId: selectedAccountId }),
      localApi.server.listLinearTeams({ accountId: selectedAccountId }),
    ])
      .then(([nextProjects, nextTeams]) => {
        if (disposed) return;
        setAvailableLinearProjects(nextProjects);
        setAvailableLinearTeams(nextTeams);
      })
      .catch((error) => {
        if (disposed) return;
        toastManager.add({
          type: "error",
          title: "Failed to load Linear account data",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
        });
      });

    return () => {
      disposed = true;
    };
  }, [localApi.server, selectedAccountId]);

  const createAccount = async () => {
    const name = newAccountName.trim();
    const apiKey = newAccountApiKey.trim();
    if (!name || !apiKey) {
      toastManager.add({ type: "warning", title: "Account name and API key are required" });
      return;
    }

    await localApi.server.createLinearAccount({
      id: crypto.randomUUID(),
      name,
      apiKey,
    });
    setNewAccountName("");
    setNewAccountApiKey("");
    await refresh();
  };

  const deleteAccount = async (accountId: string) => {
    await localApi.server.deleteLinearAccount({ id: accountId });
    await refresh();
  };

  const addProjectMapping = async () => {
    if (!selectedAccountId || !selectedLinearProjectId || !selectedAppProjectKey) {
      toastManager.add({
        type: "warning",
        title: "Select account, Linear project, and app project",
      });
      return;
    }

    const linearProject = availableLinearProjects.find(
      (entry) => entry.id === selectedLinearProjectId,
    );
    const appProject = appProjectOptions.find((entry) => entry.key === selectedAppProjectKey);
    if (!linearProject || !appProject) {
      toastManager.add({ type: "error", title: "Invalid mapping selection" });
      return;
    }

    const retained = mappings.filter((entry) => entry.accountId !== selectedAccountId);
    const forAccount = mappings.filter((entry) => entry.accountId === selectedAccountId);
    const nextForAccount = [
      ...forAccount,
      {
        id: crypto.randomUUID(),
        accountId: selectedAccountId,
        linearProjectId: linearProject.id,
        linearProjectName: linearProject.name,
        environmentId: appProject.environmentId,
        projectId: appProject.projectId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    await localApi.server.upsertLinearMappings({
      mappings: [...retained, ...nextForAccount].map((entry) => ({
        accountId: entry.accountId,
        linearProjectId: entry.linearProjectId,
        linearProjectName: entry.linearProjectName,
        environmentId: entry.environmentId,
        projectId: entry.projectId,
      })),
    });

    await refresh();
  };

  const saveTeamReviewMapping = async () => {
    if (!selectedAccountId || !selectedTeamId || reviewStateId.trim().length === 0) {
      toastManager.add({ type: "warning", title: "Select team and provide review state id" });
      return;
    }

    const retained = reviewMappings.filter((entry) => entry.accountId !== selectedAccountId);
    const forAccount = reviewMappings.filter((entry) => entry.accountId === selectedAccountId);
    const withoutTeam = forAccount.filter((entry) => entry.teamId !== selectedTeamId);

    await localApi.server.upsertLinearTeamReviewStateMappings({
      mappings: [
        ...retained,
        ...withoutTeam,
        {
          accountId: selectedAccountId,
          teamId: selectedTeamId,
          reviewStateId: reviewStateId.trim(),
        },
      ].map((entry) => ({
        accountId: entry.accountId,
        teamId: entry.teamId,
        reviewStateId: entry.reviewStateId,
      })),
    });

    await refresh();
  };

  const selectedAccountMappings = mappings.filter((entry) => entry.accountId === selectedAccountId);
  const selectedAccountReviewMappings = reviewMappings.filter(
    (entry) => entry.accountId === selectedAccountId,
  );

  return (
    <SettingsPageContainer>
      <SettingsSection
        title="Linear Accounts"
        headerAction={
          <Button size="xs" variant="outline" disabled={loading} onClick={() => void refresh()}>
            <RefreshCwIcon className="size-3.5" />
            Refresh
          </Button>
        }
      >
        <SettingsRow
          title="Add account"
          description="Add one API key per client workspace. Keys are stored in server secrets only."
          control={
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Input
                className="h-8 w-40"
                placeholder="Workspace name"
                value={newAccountName}
                onChange={(event) => setNewAccountName(event.target.value)}
              />
              <Input
                className="h-8 w-64"
                placeholder="Linear API key"
                value={newAccountApiKey}
                onChange={(event) => setNewAccountApiKey(event.target.value)}
              />
              <Button size="xs" variant="outline" onClick={() => void createAccount()}>
                <PlusIcon className="size-3.5" />
                Add
              </Button>
            </div>
          }
        />
        {accounts.map((account) => (
          <SettingsRow
            key={account.id}
            title={account.name}
            description={`Workspace: ${account.workspaceName}`}
            control={
              <Button size="xs" variant="ghost" onClick={() => void deleteAccount(account.id)}>
                <Trash2Icon className="size-3.5" />
              </Button>
            }
          />
        ))}
      </SettingsSection>

      <SettingsSection title="Linear Mapping">
        <SettingsRow
          title="Account"
          description="Choose the Linear workspace to configure project and team mappings."
          control={
            <Select
              value={selectedAccountId ?? ""}
              onValueChange={(value) => setSelectedAccountId(value || null)}
            >
              <SelectTrigger className="h-8 w-56">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectPopup>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          title="Project mapping"
          description="Map Linear projects to app projects. Board and background runs only use mapped projects."
          control={
            <div className="flex items-center gap-2">
              <Select
                value={selectedLinearProjectId ?? ""}
                onValueChange={(value) => setSelectedLinearProjectId(value || null)}
              >
                <SelectTrigger className="h-8 w-56">
                  <SelectValue placeholder="Linear project" />
                </SelectTrigger>
                <SelectPopup>
                  {availableLinearProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>

              <Select
                value={selectedAppProjectKey ?? ""}
                onValueChange={(value) => setSelectedAppProjectKey(value || null)}
              >
                <SelectTrigger className="h-8 w-56">
                  <SelectValue placeholder="App project" />
                </SelectTrigger>
                <SelectPopup>
                  {appProjectOptions.map((project) => (
                    <SelectItem key={project.key} value={project.key}>
                      {project.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>

              <Button size="xs" variant="outline" onClick={() => void addProjectMapping()}>
                Add mapping
              </Button>
            </div>
          }
        >
          <div className="px-4 pb-4 text-xs text-muted-foreground">
            {selectedAccountMappings.length === 0
              ? "No mappings for selected account."
              : selectedAccountMappings.map((mapping) => {
                  const appProject = projects.find(
                    (project) =>
                      project.id === mapping.projectId &&
                      project.environmentId === mapping.environmentId,
                  );
                  return (
                    <div key={mapping.id} className="py-1">
                      {mapping.linearProjectName} → {appProject?.name ?? mapping.projectId}
                    </div>
                  );
                })}
          </div>
        </SettingsRow>

        <SettingsRow
          title="Team review mapping"
          description="Map team to the Linear workflow state id that represents In Review."
          control={
            <div className="flex items-center gap-2">
              <Select
                value={selectedTeamId ?? ""}
                onValueChange={(value) => setSelectedTeamId(value || null)}
              >
                <SelectTrigger className="h-8 w-48">
                  <SelectValue placeholder="Team" />
                </SelectTrigger>
                <SelectPopup>
                  {availableLinearTeams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.key} · {team.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Input
                className="h-8 w-56"
                placeholder="Review state id"
                value={reviewStateId}
                onChange={(event) => setReviewStateId(event.target.value)}
              />
              <Button size="xs" variant="outline" onClick={() => void saveTeamReviewMapping()}>
                Save
              </Button>
            </div>
          }
        >
          <div className="px-4 pb-4 text-xs text-muted-foreground">
            {selectedAccountReviewMappings.length === 0
              ? "No review-state mappings for selected account."
              : selectedAccountReviewMappings.map((mapping) => {
                  const team = availableLinearTeams.find((entry) => entry.id === mapping.teamId);
                  return (
                    <div key={`${mapping.accountId}:${mapping.teamId}`} className="py-1">
                      {(team ? `${team.key} · ${team.name}` : mapping.teamId) +
                        ` → ${mapping.reviewStateId}`}
                    </div>
                  );
                })}
          </div>
        </SettingsRow>
      </SettingsSection>

      <ProjectBaseBranchSettings />
    </SettingsPageContainer>
  );
}
