import * as Schema from "effect/Schema";
import { type IntegrationKind, INTEGRATION_DISPLAY_NAMES } from "@t3tools/contracts/settings";
import { type SourceControlProviderKind } from "@t3tools/contracts";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { randomUUID } from "./lib/utils";
import {
  buildProjectAutomationExecutionLabel,
  buildProjectAutomationPromptPreview,
  type AutomationWorkspaceMode,
  type ProjectAutomationExecution,
} from "./projectAutomations";

export type ProjectTriggerEvent = "pull-request-opened" | "pull-request-merged" | "issue-created";

export interface ProjectTriggerRepository {
  provider: SourceControlProviderKind;
  nameWithOwner: string;
  url: string;
  sshUrl: string;
}

export interface ProjectTriggerExecution {
  archiveThread: boolean;
  workspaceMode: AutomationWorkspaceMode;
  branchName?: string | undefined;
}

export interface ProjectTrigger {
  id: string;
  enabled: boolean;
  title: string;
  prompt?: string | undefined;
  integrationKind: IntegrationKind;
  accountId: string;
  repository: ProjectTriggerRepository;
  event: ProjectTriggerEvent;
  execution?: ProjectTriggerExecution | undefined;
  createdAt: string;
  updatedAt: string;
}

const ProjectTriggerEventSchema = Schema.Literals([
  "pull-request-opened",
  "pull-request-merged",
  "issue-created",
]);

const ProjectTriggerRepositorySchema = Schema.Struct({
  provider: Schema.Literals(["github", "gitlab", "azure-devops", "bitbucket", "unknown"]),
  nameWithOwner: Schema.String,
  url: Schema.String,
  sshUrl: Schema.String,
});

const ProjectTriggerExecutionSchema = Schema.Struct({
  archiveThread: Schema.Boolean,
  workspaceMode: Schema.Literals(["new-worktree", "main-branch"]),
  branchName: Schema.optional(Schema.String),
});

const ProjectTriggerSchema = Schema.Struct({
  id: Schema.String,
  enabled: Schema.Boolean,
  title: Schema.String,
  prompt: Schema.optional(Schema.String),
  integrationKind: Schema.Literals(["github", "gitlab", "jira", "linear"]),
  accountId: Schema.String,
  repository: ProjectTriggerRepositorySchema,
  event: ProjectTriggerEventSchema,
  execution: Schema.optional(ProjectTriggerExecutionSchema),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

const ProjectTriggerListSchema = Schema.Array(ProjectTriggerSchema);

export function projectTriggersStorageKey(projectKey: string): string {
  return `t3code:project-triggers:v1:${projectKey}`;
}

export function useProjectTriggers(
  projectKey: string,
): [
  readonly ProjectTrigger[],
  (
    value:
      | readonly ProjectTrigger[]
      | ((value: readonly ProjectTrigger[]) => readonly ProjectTrigger[]),
  ) => void,
] {
  return useLocalStorage(
    projectTriggersStorageKey(projectKey),
    [] as readonly ProjectTrigger[],
    ProjectTriggerListSchema,
  ) as [
    readonly ProjectTrigger[],
    (
      value:
        | readonly ProjectTrigger[]
        | ((value: readonly ProjectTrigger[]) => readonly ProjectTrigger[]),
    ) => void,
  ];
}

function buildProjectTriggerTitle(input: {
  integrationKind: IntegrationKind;
  repositoryNameWithOwner: string;
  event: ProjectTriggerEvent;
}): string {
  const integrationLabel = INTEGRATION_DISPLAY_NAMES[input.integrationKind];
  const eventLabel = buildProjectTriggerEventLabel(input.event);
  return `${integrationLabel} · ${eventLabel} · ${input.repositoryNameWithOwner}`;
}

export function buildProjectTriggerEventLabel(event: ProjectTriggerEvent): string {
  switch (event) {
    case "pull-request-opened":
      return "Pull request opened";
    case "pull-request-merged":
      return "Pull request merged";
    case "issue-created":
      return "Issue created";
  }
}

export function buildProjectTriggerExecutionLabel(execution?: ProjectTriggerExecution): string {
  return buildProjectAutomationExecutionLabel(execution as ProjectAutomationExecution | undefined);
}

export function buildProjectTriggerPromptPreview(prompt: string): string {
  return buildProjectAutomationPromptPreview(prompt);
}

export function buildProjectTriggerSummary(trigger: ProjectTrigger): string {
  return `${INTEGRATION_DISPLAY_NAMES[trigger.integrationKind]} · ${buildProjectTriggerEventLabel(trigger.event)} · ${trigger.repository.nameWithOwner}`;
}

export function createProjectTrigger(input: {
  integrationKind: IntegrationKind;
  accountId: string;
  repository: ProjectTriggerRepository;
  event: ProjectTriggerEvent;
  title: string;
  prompt: string;
  execution: ProjectTriggerExecution;
}): ProjectTrigger {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    enabled: true,
    title:
      input.title.trim().length > 0
        ? input.title.trim()
        : buildProjectTriggerTitle({
            integrationKind: input.integrationKind,
            repositoryNameWithOwner: input.repository.nameWithOwner,
            event: input.event,
          }),
    prompt: input.prompt.trim(),
    integrationKind: input.integrationKind,
    accountId: input.accountId,
    repository: input.repository,
    event: input.event,
    execution: input.execution,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateProjectTrigger(
  trigger: ProjectTrigger,
  patch: Partial<
    Pick<
      ProjectTrigger,
      "enabled" | "title" | "prompt" | "accountId" | "repository" | "event" | "execution"
    >
  >,
): ProjectTrigger {
  return {
    ...trigger,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

export function deleteProjectTrigger(
  triggers: readonly ProjectTrigger[],
  triggerId: string,
): ProjectTrigger[] {
  return triggers.filter((trigger) => trigger.id !== triggerId);
}
