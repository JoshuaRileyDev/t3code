import {
  type LinearIssue,
  type LinearProject,
  type LinearTeam,
  type LinearWorkflowState,
} from "@t3tools/contracts";
import { Effect, Layer } from "effect";

import {
  LinearApiClient,
  LinearApiClientError,
  type LinearApiClientShape,
  type LinearWorkspaceInfo,
} from "../Services/LinearApiClient.ts";

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

function parseGraphqlData<T>(json: unknown): T {
  if (typeof json !== "object" || json === null) {
    throw new Error("Unexpected Linear response payload.");
  }

  const record = json as Record<string, unknown>;
  const errors = record.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0] as { message?: unknown };
    throw new Error(typeof first?.message === "string" ? first.message : "Linear API error.");
  }

  return record.data as T;
}

const postGraphql = <T>(apiKey: string, query: string, variables?: Record<string, unknown>) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(LINEAR_GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey,
        },
        body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
      });

      if (!response.ok) {
        throw new Error(`Linear API request failed (${response.status}).`);
      }

      const json = await response.json();
      return parseGraphqlData<T>(json);
    },
    catch: (cause) =>
      new LinearApiClientError({
        message: "Linear API request failed.",
        cause,
      }),
  });

const decodeString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const decodeNullableString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const toPriorityNumber = (value: unknown): number =>
  typeof value === "number" ? value : Number.parseInt(String(value), 10) || 0;

function decodeIssue(node: Record<string, unknown>): LinearIssue | null {
  const id = decodeString(node.id, "").trim();
  const identifier = decodeString(node.identifier, "").trim();
  const title = decodeString(node.title, "").trim();
  const description = decodeString(node.description, "");
  const url = decodeString(node.url, "");
  const priority = toPriorityNumber(node.priority);
  const state = (node.state as Record<string, unknown> | undefined) ?? {};
  const team = (node.team as Record<string, unknown> | undefined) ?? {};
  const project = (node.project as Record<string, unknown> | undefined) ?? {};
  const assignee = (node.assignee as Record<string, unknown> | undefined) ?? {};
  const stateId = decodeString(state.id, "").trim();
  const stateName = decodeString(state.name, "").trim();
  const teamId = decodeString(team.id, "").trim();
  const teamName = decodeString(team.name, "").trim();
  const updatedAt = decodeString(node.updatedAt, "").trim();

  if (
    !id ||
    !identifier ||
    !title ||
    !url ||
    !stateId ||
    !stateName ||
    !teamId ||
    !teamName ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id: id as never,
    identifier: identifier as never,
    title: title as never,
    description,
    url,
    priority,
    stateId: stateId as never,
    stateName: stateName as never,
    teamId: teamId as never,
    teamName: teamName as never,
    projectId: decodeNullableString(project.id) as never,
    projectName: decodeNullableString(project.name) as never,
    assigneeName: decodeNullableString(assignee.name) as never,
    updatedAt: updatedAt as never,
  };
}

function decodeWorkflowStates(
  data: { workflowStates?: { nodes?: Array<Record<string, unknown>> } } | undefined,
): ReadonlyArray<LinearWorkflowState> {
  return (data?.workflowStates?.nodes ?? []).flatMap((node) => {
    const id = decodeString(node.id, "").trim();
    const name = decodeString(node.name, "").trim();
    const type = decodeString(node.type, "").trim();
    const teamId = decodeString((node.team as Record<string, unknown> | undefined)?.id, "").trim();
    if (!id || !name || !type || !teamId) return [];
    return [
      {
        id: id as never,
        name: name as never,
        type: type as never,
        teamId: teamId as never,
      },
    ];
  });
}

function decodeProjects(
  data: { projects?: { nodes?: Array<Record<string, unknown>> } } | undefined,
): ReadonlyArray<LinearProject> {
  return (data?.projects?.nodes ?? []).flatMap((node) => {
    const id = decodeString(node.id, "").trim();
    const name = decodeString(node.name, "").trim();
    const key = decodeNullableString(node.key);
    const teams =
      ((node.teams as Record<string, unknown> | undefined)?.nodes as
        | Array<Record<string, unknown>>
        | undefined) ?? [];
    const firstTeam = teams[0];
    const teamId = decodeString(firstTeam?.id, "").trim();
    const teamName = decodeString(firstTeam?.name, "").trim();
    if (!id || !name || !teamId || !teamName) return [];
    return [
      {
        id: id as never,
        name: name as never,
        key: key as never,
        teamId: teamId as never,
        teamName: teamName as never,
      },
    ];
  });
}

const makeLinearApiClient = Effect.gen(function* () {
  const getWorkspaceInfo: LinearApiClientShape["getWorkspaceInfo"] = (apiKey) =>
    postGraphql<{ viewer?: { id?: unknown; organization?: { id?: unknown; name?: unknown } } }>(
      apiKey,
      `query Viewer { viewer { id organization { id name } } }`,
    ).pipe(
      Effect.map(
        (data): LinearWorkspaceInfo => ({
          id:
            decodeString(data.viewer?.organization?.id, "") ||
            decodeString(data.viewer?.id, "") ||
            "linear-workspace",
          name:
            decodeString(data.viewer?.organization?.name, "Linear Workspace") || "Linear Workspace",
        }),
      ),
    );

  const listTeams: LinearApiClientShape["listTeams"] = (apiKey) =>
    postGraphql<{ teams?: { nodes?: Array<Record<string, unknown>> } }>(
      apiKey,
      `query Teams { teams { nodes { id key name } } }`,
    ).pipe(
      Effect.map(
        (data): ReadonlyArray<LinearTeam> =>
          (data.teams?.nodes ?? []).flatMap((node) => {
            const id = decodeString(node.id, "").trim();
            const key = decodeString(node.key, "").trim();
            const name = decodeString(node.name, "").trim();
            if (!id || !key || !name) return [];
            return [{ id: id as never, key: key as never, name: name as never }];
          }),
      ),
    );

  const listWorkflowStates: LinearApiClientShape["listWorkflowStates"] = (apiKey, input) =>
    postGraphql<{ workflowStates?: { nodes?: Array<Record<string, unknown>> } }>(
      apiKey,
      input.teamIds && input.teamIds.length > 0
        ? `query WorkflowStates($teamIds: [String!]) {
            workflowStates(filter: { team: { id: { in: $teamIds } } }) {
              nodes { id name type team { id } }
            }
          }`
        : `query WorkflowStates {
            workflowStates {
              nodes { id name type team { id } }
            }
          }`,
      input.teamIds && input.teamIds.length > 0 ? { teamIds: input.teamIds } : undefined,
    ).pipe(Effect.map((data): ReadonlyArray<LinearWorkflowState> => decodeWorkflowStates(data)));

  const listProjects: LinearApiClientShape["listProjects"] = (apiKey, input) =>
    postGraphql<{ projects?: { nodes?: Array<Record<string, unknown>> } }>(
      apiKey,
      input.teamIds && input.teamIds.length > 0
        ? `query Projects($teamIds: [String!]) {
            projects(filter: { teams: { some: { id: { in: $teamIds } } } }) {
              nodes { id name key teams { nodes { id name } } }
            }
          }`
        : `query Projects {
            projects {
              nodes { id name key teams { nodes { id name } } }
            }
          }`,
      input.teamIds && input.teamIds.length > 0 ? { teamIds: input.teamIds } : undefined,
    ).pipe(Effect.map((data): ReadonlyArray<LinearProject> => decodeProjects(data)));

  const listIssues: LinearApiClientShape["listIssues"] = (apiKey, input) =>
    postGraphql<{ issues?: { nodes?: Array<Record<string, unknown>> } }>(
      apiKey,
      input.teamIds && input.teamIds.length > 0 && input.projectIds && input.projectIds.length > 0
        ? `query Issues($teamIds: [String!], $projectIds: [String!]) {
            issues(
              filter: {
                team: { id: { in: $teamIds } }
                project: { id: { in: $projectIds } }
              }
            ) {
              nodes {
                id
                identifier
                title
                description
                url
                priority
                updatedAt
                state { id name }
                team { id name }
                project { id name }
                assignee { name }
              }
            }
          }`
        : input.projectIds && input.projectIds.length > 0
          ? `query Issues($projectIds: [String!]) {
              issues(filter: { project: { id: { in: $projectIds } } }) {
                nodes {
                  id
                  identifier
                  title
                  description
                  url
                  priority
                  updatedAt
                  state { id name }
                  team { id name }
                  project { id name }
                  assignee { name }
                }
              }
            }`
          : input.teamIds && input.teamIds.length > 0
            ? `query Issues($teamIds: [String!]) {
                issues(filter: { team: { id: { in: $teamIds } } }) {
                  nodes {
                    id
                    identifier
                    title
                    description
                    url
                    priority
                    updatedAt
                    state { id name }
                    team { id name }
                    project { id name }
                    assignee { name }
                  }
                }
              }`
            : `query Issues {
                issues {
                  nodes {
                    id
                    identifier
                    title
                    description
                    url
                    priority
                    updatedAt
                    state { id name }
                    team { id name }
                    project { id name }
                    assignee { name }
                  }
                }
              }`,
      input.teamIds && input.teamIds.length > 0 && input.projectIds && input.projectIds.length > 0
        ? {
            teamIds: input.teamIds,
            projectIds: input.projectIds,
          }
        : input.projectIds && input.projectIds.length > 0
          ? {
              projectIds: input.projectIds,
            }
          : input.teamIds && input.teamIds.length > 0
            ? {
                teamIds: input.teamIds,
              }
            : undefined,
    ).pipe(
      Effect.map(
        (data): ReadonlyArray<LinearIssue> =>
          (data.issues?.nodes ?? []).flatMap((node) => {
            const issue = decodeIssue(node);
            return issue ? [issue] : [];
          }),
      ),
    );

  const getIssue: LinearApiClientShape["getIssue"] = (apiKey, input) =>
    postGraphql<{ issue?: Record<string, unknown> }>(
      apiKey,
      `query Issue($issueId: String!) {
        issue(id: $issueId) {
          id
          identifier
          title
          description
          url
          priority
          updatedAt
          state { id name }
          team { id name }
          project { id name }
          assignee { name }
        }
      }`,
      { issueId: input.issueId },
    ).pipe(
      Effect.flatMap((data) => {
        const issue = data.issue ? decodeIssue(data.issue) : null;
        return issue
          ? Effect.succeed(issue)
          : Effect.fail(
              new LinearApiClientError({
                message: `Linear issue ${input.issueId} was not found.`,
              }),
            );
      }),
    );

  const updateIssueState: LinearApiClientShape["updateIssueState"] = (apiKey, input) =>
    postGraphql<{ issueUpdate?: { success?: unknown } }>(
      apiKey,
      `mutation MoveIssue($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) { success }
      }`,
      { issueId: input.issueId, stateId: input.stateId },
    ).pipe(Effect.asVoid);

  return {
    getWorkspaceInfo,
    listTeams,
    listWorkflowStates,
    listProjects,
    listIssues,
    getIssue,
    updateIssueState,
  } satisfies LinearApiClientShape;
});

export const LinearApiClientLive = Layer.effect(LinearApiClient, makeLinearApiClient);
