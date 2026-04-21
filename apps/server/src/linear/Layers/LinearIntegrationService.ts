import {
  CommandId,
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  ProjectId,
  ThreadId,
  type LinearAccount,
  type LinearIssueRunJob,
  type LinearIssueRunStatus,
  type LinearProjectMapping,
  type LinearTeamReviewStateMapping,
  LinearIntegrationError,
  MessageId,
} from "@t3tools/contracts";
import { Effect, Layer, Option } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { ServerSecretStore } from "../../auth/Services/ServerSecretStore.ts";
import { GitManager } from "../../git/Services/GitManager.ts";
import { GitHubCli } from "../../git/Services/GitHubCli.ts";
import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import {
  LinearIntegrationService,
  type LinearIntegrationServiceShape,
} from "../Services/LinearIntegrationService.ts";
import { LinearApiClient, LinearApiClientError } from "../Services/LinearApiClient.ts";
import { FileSystem, Path } from "effect";

type LinearAccountRow = {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  teamIdsJson: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

type LinearProjectMappingRow = {
  id: string;
  accountId: string;
  linearProjectId: string;
  linearProjectName: string;
  environmentId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

type LinearTeamReviewStateMappingRow = {
  accountId: string;
  teamId: string;
  reviewStateId: string;
  updatedAt: string;
};

type LinearIssueRunRow = {
  id: string;
  accountId: string;
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  issueUrl: string;
  status: string;
  environmentId: string;
  projectId: string;
  hiddenThreadId: string;
  branch: string | null;
  baseBranch: string | null;
  prUrl: string | null;
  prNumber: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const linearApiKeySecret = (accountId: string) => `linear-account-${accountId}-api-key`;

const nowIso = () => new Date().toISOString();

const linearError = (message: string, cause?: unknown) =>
  new LinearIntegrationError({
    message,
    ...(cause !== undefined ? { cause } : {}),
  });

function parseTeamIds(json: string): ReadonlyArray<string> {
  try {
    const value = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function mapAccount(row: LinearAccountRow): LinearAccount {
  return {
    id: row.id as never,
    name: row.name as never,
    workspaceId: row.workspaceId as never,
    workspaceName: row.workspaceName as never,
    teamIds: Array.from(parseTeamIds(row.teamIdsJson)) as never,
    createdAt: row.createdAt as never,
    updatedAt: row.updatedAt as never,
  };
}

function mapProjectMapping(row: LinearProjectMappingRow): LinearProjectMapping {
  return {
    id: row.id as never,
    accountId: row.accountId as never,
    linearProjectId: row.linearProjectId as never,
    linearProjectName: row.linearProjectName as never,
    environmentId: row.environmentId as never,
    projectId: row.projectId as never,
    createdAt: row.createdAt as never,
    updatedAt: row.updatedAt as never,
  };
}

function mapReviewStateMapping(row: LinearTeamReviewStateMappingRow): LinearTeamReviewStateMapping {
  return {
    accountId: row.accountId as never,
    teamId: row.teamId as never,
    reviewStateId: row.reviewStateId as never,
    updatedAt: row.updatedAt as never,
  };
}

function mapIssueRun(row: LinearIssueRunRow): LinearIssueRunJob {
  return {
    id: row.id as never,
    accountId: row.accountId as never,
    issueId: row.issueId as never,
    issueIdentifier: row.issueIdentifier as never,
    issueTitle: row.issueTitle as never,
    issueUrl: row.issueUrl,
    status: row.status as LinearIssueRunStatus,
    environmentId: row.environmentId as never,
    projectId: row.projectId as never,
    hiddenThreadId: row.hiddenThreadId as never,
    branch: row.branch as never,
    baseBranch: row.baseBranch as never,
    prUrl: row.prUrl,
    prNumber: row.prNumber,
    error: row.error,
    createdAt: row.createdAt as never,
    updatedAt: row.updatedAt as never,
    completedAt: row.completedAt as never,
  };
}

function hasReadyForReviewMarker(text: string): boolean {
  return /\bREADY_FOR_REVIEW\b/.test(text);
}

function buildLinearPrompt(input: {
  readonly issueIdentifier: string;
  readonly issueTitle: string;
  readonly issueUrl: string;
  readonly projectTitle: string;
}): string {
  return [
    `Linear issue: ${input.issueIdentifier} - ${input.issueTitle}`,
    `Issue URL: ${input.issueUrl}`,
    `Target project: ${input.projectTitle}`,
    "",
    "Implement the issue in this repository.",
    "When implementation is complete and ready for PR, end your final assistant message with:",
    "READY_FOR_REVIEW",
    "",
    "Also include a short summary block with:",
    "- changed files",
    "- test/lint/typecheck status",
    "- any known follow-ups",
  ].join("\n");
}

const makeLinearIntegrationService = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const secretStore = yield* ServerSecretStore;
  const linearApiClient = yield* LinearApiClient;
  const orchestrationEngine = yield* OrchestrationEngineService;
  const gitManager = yield* GitManager;
  const gitHubCli = yield* GitHubCli;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const loadAccountRows = (accountIds?: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      if (accountIds && accountIds.length > 0) {
        return (yield* sql<LinearAccountRow>`
          SELECT
            id,
            name,
            workspace_id AS "workspaceId",
            workspace_name AS "workspaceName",
            team_ids_json AS "teamIdsJson",
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            archived_at AS "archivedAt"
          FROM linear_accounts
          WHERE archived_at IS NULL
            AND id IN ${sql.in(accountIds)}
          ORDER BY created_at ASC
        `) as ReadonlyArray<LinearAccountRow>;
      }

      return (yield* sql<LinearAccountRow>`
        SELECT
          id,
          name,
          workspace_id AS "workspaceId",
          workspace_name AS "workspaceName",
          team_ids_json AS "teamIdsJson",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          archived_at AS "archivedAt"
        FROM linear_accounts
        WHERE archived_at IS NULL
        ORDER BY created_at ASC
      `) as ReadonlyArray<LinearAccountRow>;
    });

  const loadSingleAccountRow = (accountId: string) =>
    loadAccountRows([accountId]).pipe(
      Effect.flatMap((rows) =>
        rows[0]
          ? Effect.succeed(rows[0])
          : Effect.fail(linearError(`Linear account ${accountId} was not found.`)),
      ),
    );

  const loadApiKey = (accountId: string) =>
    secretStore.get(linearApiKeySecret(accountId)).pipe(
      Effect.mapError((cause) => linearError("Failed to load Linear API key.", cause)),
      Effect.flatMap((bytes) =>
        bytes
          ? Effect.succeed(textDecoder.decode(bytes))
          : Effect.fail(linearError(`Linear API key missing for account ${accountId}.`)),
      ),
    );

  const listMappingsRows = () =>
    sql<LinearProjectMappingRow>`
      SELECT
        id,
        account_id AS "accountId",
        linear_project_id AS "linearProjectId",
        linear_project_name AS "linearProjectName",
        environment_id AS "environmentId",
        project_id AS "projectId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM linear_project_mappings
      ORDER BY created_at ASC
    `;

  const listReviewMappingsRows = () =>
    sql<LinearTeamReviewStateMappingRow>`
      SELECT
        account_id AS "accountId",
        team_id AS "teamId",
        review_state_id AS "reviewStateId",
        updated_at AS "updatedAt"
      FROM linear_team_review_state_mappings
      ORDER BY account_id ASC, team_id ASC
    `;

  const loadIssueRunRowById = (jobId: string) =>
    sql<LinearIssueRunRow>`
      SELECT
        id,
        account_id AS "accountId",
        issue_id AS "issueId",
        issue_identifier AS "issueIdentifier",
        issue_title AS "issueTitle",
        issue_url AS "issueUrl",
        status,
        environment_id AS "environmentId",
        project_id AS "projectId",
        hidden_thread_id AS "hiddenThreadId",
        branch,
        base_branch AS "baseBranch",
        pr_url AS "prUrl",
        pr_number AS "prNumber",
        error,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        completed_at AS "completedAt"
      FROM linear_issue_runs
      WHERE id = ${jobId}
      LIMIT 1
    `.pipe(
      Effect.flatMap((rows) =>
        rows[0]
          ? Effect.succeed(rows[0])
          : Effect.fail(linearError(`Linear issue run ${jobId} was not found.`)),
      ),
    );

  const updateRunRow = (
    jobId: string,
    patch: {
      readonly status?: LinearIssueRunStatus;
      readonly branch?: string | null;
      readonly baseBranch?: string | null;
      readonly prUrl?: string | null;
      readonly prNumber?: number | null;
      readonly error?: string | null;
      readonly completedAt?: string | null;
    },
  ) =>
    Effect.gen(function* () {
      const current = yield* loadIssueRunRowById(jobId);
      const updatedAt = nowIso();
      const nextStatus = patch.status ?? (current.status as LinearIssueRunStatus);
      const nextBranch = patch.branch !== undefined ? patch.branch : current.branch;
      const nextBaseBranch = patch.baseBranch !== undefined ? patch.baseBranch : current.baseBranch;
      const nextPrUrl = patch.prUrl !== undefined ? patch.prUrl : current.prUrl;
      const nextPrNumber = patch.prNumber !== undefined ? patch.prNumber : current.prNumber;
      const nextError = patch.error !== undefined ? patch.error : current.error;
      const nextCompletedAt =
        patch.completedAt !== undefined ? patch.completedAt : current.completedAt;

      yield* sql`
        UPDATE linear_issue_runs
        SET
          status = ${nextStatus},
          branch = ${nextBranch},
          base_branch = ${nextBaseBranch},
          pr_url = ${nextPrUrl},
          pr_number = ${nextPrNumber},
          error = ${nextError},
          updated_at = ${updatedAt},
          completed_at = ${nextCompletedAt}
        WHERE id = ${jobId}
      `;

      return yield* loadIssueRunRowById(jobId);
    });

  const listAccounts: LinearIntegrationServiceShape["listAccounts"] = () =>
    loadAccountRows().pipe(
      Effect.map((rows) => rows.map(mapAccount)),
      Effect.mapError((cause) => linearError("Failed to list Linear accounts.", cause)),
    );

  const createAccount: LinearIntegrationServiceShape["createAccount"] = (input) =>
    Effect.gen(function* () {
      const existingRows = yield* loadAccountRows([input.id]).pipe(
        Effect.mapError((cause) => linearError("Failed to check existing Linear account.", cause)),
      );
      if (existingRows.length > 0) {
        return yield* Effect.fail(linearError(`Linear account ${input.id} already exists.`));
      }

      const workspaceInfo = yield* linearApiClient
        .getWorkspaceInfo(input.apiKey)
        .pipe(
          Effect.mapError((cause) =>
            linearError(
              "Failed to validate Linear API key.",
              cause instanceof LinearApiClientError ? cause.message : cause,
            ),
          ),
        );
      const createdAt = nowIso();

      yield* sql`
        INSERT INTO linear_accounts (
          id,
          name,
          workspace_id,
          workspace_name,
          team_ids_json,
          created_at,
          updated_at,
          archived_at
        )
        VALUES (
          ${input.id},
          ${input.name},
          ${workspaceInfo.id},
          ${workspaceInfo.name},
          ${JSON.stringify([])},
          ${createdAt},
          ${createdAt},
          NULL
        )
      `.pipe(Effect.mapError((cause) => linearError("Failed to persist Linear account.", cause)));

      yield* secretStore
        .set(linearApiKeySecret(input.id), textEncoder.encode(input.apiKey))
        .pipe(Effect.mapError((cause) => linearError("Failed to store Linear API key.", cause)));

      const row = yield* loadSingleAccountRow(input.id);
      return mapAccount(row);
    }).pipe(Effect.mapError((cause) => linearError("Failed to create Linear account.", cause)));

  const updateAccount: LinearIntegrationServiceShape["updateAccount"] = (input) =>
    Effect.gen(function* () {
      const current = yield* loadSingleAccountRow(input.id);
      const updatedAt = nowIso();
      const nextName = input.name ?? current.name;
      const nextTeamIdsJson = input.teamIds ? JSON.stringify(input.teamIds) : current.teamIdsJson;

      yield* sql`
        UPDATE linear_accounts
        SET
          name = ${nextName},
          team_ids_json = ${nextTeamIdsJson},
          updated_at = ${updatedAt}
        WHERE id = ${input.id}
      `.pipe(Effect.mapError((cause) => linearError("Failed to update Linear account.", cause)));

      if (input.apiKey !== undefined) {
        const workspaceInfo = yield* linearApiClient
          .getWorkspaceInfo(input.apiKey)
          .pipe(
            Effect.mapError((cause) =>
              linearError(
                "Failed to validate updated Linear API key.",
                cause instanceof LinearApiClientError ? cause.message : cause,
              ),
            ),
          );

        yield* sql`
          UPDATE linear_accounts
          SET
            workspace_id = ${workspaceInfo.id},
            workspace_name = ${workspaceInfo.name},
            updated_at = ${updatedAt}
          WHERE id = ${input.id}
        `.pipe(
          Effect.mapError((cause) =>
            linearError("Failed to update Linear workspace metadata.", cause),
          ),
        );

        yield* secretStore
          .set(linearApiKeySecret(input.id), textEncoder.encode(input.apiKey))
          .pipe(
            Effect.mapError((cause) =>
              linearError("Failed to store updated Linear API key.", cause),
            ),
          );
      }

      const row = yield* loadSingleAccountRow(input.id);
      return mapAccount(row);
    }).pipe(Effect.mapError((cause) => linearError("Failed to update Linear account.", cause)));

  const deleteAccount: LinearIntegrationServiceShape["deleteAccount"] = (input) =>
    Effect.gen(function* () {
      const archivedAt = nowIso();
      yield* sql`
        UPDATE linear_accounts
        SET
          archived_at = ${archivedAt},
          updated_at = ${archivedAt}
        WHERE id = ${input.id}
      `.pipe(Effect.mapError((cause) => linearError("Failed to archive Linear account.", cause)));

      yield* secretStore
        .remove(linearApiKeySecret(input.id))
        .pipe(Effect.mapError((cause) => linearError("Failed to remove Linear API key.", cause)));
    });

  const listTeams: LinearIntegrationServiceShape["listTeams"] = (input) =>
    Effect.gen(function* () {
      const apiKey = yield* loadApiKey(input.accountId);
      const teams = yield* linearApiClient
        .listTeams(apiKey)
        .pipe(
          Effect.mapError((cause) =>
            linearError(
              "Failed to list Linear teams.",
              cause instanceof LinearApiClientError ? cause.message : cause,
            ),
          ),
        );
      return Array.from(teams);
    });

  const listProjects: LinearIntegrationServiceShape["listProjects"] = (input) =>
    Effect.gen(function* () {
      const account = yield* loadSingleAccountRow(input.accountId);
      const teamIds = parseTeamIds(account.teamIdsJson);
      const apiKey = yield* loadApiKey(input.accountId);
      const projects = yield* linearApiClient
        .listProjects(apiKey, {
          ...(teamIds.length > 0 ? { teamIds } : {}),
        })
        .pipe(
          Effect.mapError((cause) =>
            linearError(
              "Failed to list Linear projects.",
              cause instanceof LinearApiClientError ? cause.message : cause,
            ),
          ),
        );
      return Array.from(projects);
    }).pipe(Effect.mapError((cause) => linearError("Failed to list Linear projects.", cause)));

  const listMappings: LinearIntegrationServiceShape["listMappings"] = () =>
    Effect.gen(function* () {
      const rows = yield* listMappingsRows().pipe(
        Effect.mapError((cause) => linearError("Failed to list Linear project mappings.", cause)),
      );
      return rows.map(mapProjectMapping);
    });

  const upsertMappings: LinearIntegrationServiceShape["upsertMappings"] = (input) =>
    Effect.gen(function* () {
      const updatedAt = nowIso();
      const accountIds = Array.from(new Set(input.mappings.map((entry) => entry.accountId)));

      if (accountIds.length > 0) {
        yield* sql`
          DELETE FROM linear_project_mappings
          WHERE account_id IN ${sql.in(accountIds)}
        `.pipe(
          Effect.mapError((cause) =>
            linearError("Failed to clear existing Linear project mappings.", cause),
          ),
        );
      }

      for (const mapping of input.mappings) {
        const id = crypto.randomUUID();
        yield* sql`
          INSERT INTO linear_project_mappings (
            id,
            account_id,
            linear_project_id,
            linear_project_name,
            environment_id,
            project_id,
            created_at,
            updated_at
          )
          VALUES (
            ${id},
            ${mapping.accountId},
            ${mapping.linearProjectId},
            ${mapping.linearProjectName},
            ${mapping.environmentId},
            ${mapping.projectId},
            ${updatedAt},
            ${updatedAt}
          )
        `.pipe(
          Effect.mapError((cause) =>
            linearError("Failed to upsert Linear project mapping.", cause),
          ),
        );
      }

      const rows = yield* listMappingsRows().pipe(
        Effect.mapError((cause) => linearError("Failed to list Linear project mappings.", cause)),
      );
      return rows.map(mapProjectMapping);
    });

  const listTeamReviewStateMappings: LinearIntegrationServiceShape["listTeamReviewStateMappings"] =
    () =>
      Effect.gen(function* () {
        const rows = yield* listReviewMappingsRows().pipe(
          Effect.mapError((cause) =>
            linearError("Failed to list Linear review state mappings.", cause),
          ),
        );
        return rows.map(mapReviewStateMapping);
      });

  const upsertTeamReviewStateMappings: LinearIntegrationServiceShape["upsertTeamReviewStateMappings"] =
    (input) =>
      Effect.gen(function* () {
        const updatedAt = nowIso();
        const accountIds = Array.from(new Set(input.mappings.map((entry) => entry.accountId)));

        if (accountIds.length > 0) {
          yield* sql`
          DELETE FROM linear_team_review_state_mappings
          WHERE account_id IN ${sql.in(accountIds)}
        `.pipe(
            Effect.mapError((cause) =>
              linearError("Failed to clear existing review state mappings.", cause),
            ),
          );
        }

        for (const mapping of input.mappings) {
          yield* sql`
          INSERT INTO linear_team_review_state_mappings (
            account_id,
            team_id,
            review_state_id,
            updated_at
          )
          VALUES (
            ${mapping.accountId},
            ${mapping.teamId},
            ${mapping.reviewStateId},
            ${updatedAt}
          )
        `.pipe(
            Effect.mapError((cause) =>
              linearError("Failed to upsert review state mapping.", cause),
            ),
          );
        }

        const rows = yield* listReviewMappingsRows().pipe(
          Effect.mapError((cause) =>
            linearError("Failed to list Linear review state mappings.", cause),
          ),
        );
        return rows.map(mapReviewStateMapping);
      });

  const listIssues: LinearIntegrationServiceShape["listIssues"] = (input) =>
    Effect.gen(function* () {
      const accounts = yield* loadAccountRows(input.accountIds);
      const mappings = yield* listMappingsRows().pipe(
        Effect.mapError((cause) => linearError("Failed to load Linear mappings.", cause)),
      );

      const issues = yield* Effect.forEach(
        accounts,
        (account) =>
          Effect.gen(function* () {
            const accountMappings = mappings.filter((mapping) => mapping.accountId === account.id);
            const mappedLinearProjectIds = Array.from(
              new Set(accountMappings.map((mapping) => mapping.linearProjectId)),
            );
            if (mappedLinearProjectIds.length === 0) {
              return [] as const;
            }

            const apiKey = yield* loadApiKey(account.id);
            const teamIds = parseTeamIds(account.teamIdsJson);
            const rows = yield* linearApiClient
              .listIssues(apiKey, {
                ...(teamIds.length > 0 ? { teamIds } : {}),
                projectIds: mappedLinearProjectIds,
              })
              .pipe(
                Effect.mapError((cause) =>
                  linearError(
                    "Failed to list Linear issues.",
                    cause instanceof LinearApiClientError ? cause.message : cause,
                  ),
                ),
              );
            return Array.from(rows);
          }),
        { concurrency: 4 },
      );

      const deduped = new Map<string, (typeof issues)[number][number]>();
      for (const accountIssues of issues) {
        for (const issue of accountIssues) {
          deduped.set(issue.id, issue);
        }
      }

      return {
        issues: Array.from(deduped.values()).toSorted((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        ),
      };
    }).pipe(Effect.mapError((cause) => linearError("Failed to list Linear issues.", cause)));

  const listIssueRuns: LinearIntegrationServiceShape["listIssueRuns"] = (input) =>
    Effect.gen(function* () {
      const rows =
        input.accountIds && input.accountIds.length > 0
          ? yield* sql<LinearIssueRunRow>`
            SELECT
              id,
              account_id AS "accountId",
              issue_id AS "issueId",
              issue_identifier AS "issueIdentifier",
              issue_title AS "issueTitle",
              issue_url AS "issueUrl",
              status,
              environment_id AS "environmentId",
              project_id AS "projectId",
              hidden_thread_id AS "hiddenThreadId",
              branch,
              base_branch AS "baseBranch",
              pr_url AS "prUrl",
              pr_number AS "prNumber",
              error,
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              completed_at AS "completedAt"
            FROM linear_issue_runs
            WHERE account_id IN ${sql.in(input.accountIds)}
            ORDER BY updated_at DESC
            LIMIT 500
          `
          : yield* sql<LinearIssueRunRow>`
            SELECT
              id,
              account_id AS "accountId",
              issue_id AS "issueId",
              issue_identifier AS "issueIdentifier",
              issue_title AS "issueTitle",
              issue_url AS "issueUrl",
              status,
              environment_id AS "environmentId",
              project_id AS "projectId",
              hidden_thread_id AS "hiddenThreadId",
              branch,
              base_branch AS "baseBranch",
              pr_url AS "prUrl",
              pr_number AS "prNumber",
              error,
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              completed_at AS "completedAt"
            FROM linear_issue_runs
            ORDER BY updated_at DESC
            LIMIT 500
          `;

      return {
        jobs: rows.map(mapIssueRun),
      };
    }).pipe(Effect.mapError((cause) => linearError("Failed to list Linear issue runs.", cause)));

  const startIssueRun: LinearIntegrationServiceShape["startIssueRun"] = (input) =>
    Effect.gen(function* () {
      const readModel = yield* orchestrationEngine.getReadModel();
      const project = readModel.projects.find((entry) => entry.id === input.projectId);
      if (!project) {
        return yield* Effect.fail(linearError(`Project ${input.projectId} was not found.`));
      }

      const mappingRows = yield* listMappingsRows().pipe(
        Effect.mapError((cause) => linearError("Failed to read Linear project mappings.", cause)),
      );
      const hasMapping = mappingRows.some(
        (mapping) => mapping.accountId === input.accountId && mapping.projectId === input.projectId,
      );
      if (!hasMapping) {
        return yield* Effect.fail(
          linearError("Selected project is not mapped to the Linear account."),
        );
      }

      const createdAt = nowIso();
      const jobId = crypto.randomUUID();
      const threadId = ThreadId.make(crypto.randomUUID());

      yield* sql`
        INSERT INTO linear_issue_runs (
          id,
          account_id,
          issue_id,
          issue_identifier,
          issue_title,
          issue_url,
          status,
          environment_id,
          project_id,
          hidden_thread_id,
          branch,
          base_branch,
          pr_url,
          pr_number,
          error,
          created_at,
          updated_at,
          completed_at
        )
        VALUES (
          ${jobId},
          ${input.accountId},
          ${input.issueId},
          ${input.issueIdentifier},
          ${input.issueTitle},
          ${input.issueUrl},
          ${"queued" satisfies LinearIssueRunStatus},
          ${input.environmentId},
          ${input.projectId},
          ${threadId},
          NULL,
          ${project.defaultPrBaseBranch ?? null},
          NULL,
          NULL,
          NULL,
          ${createdAt},
          ${createdAt},
          NULL
        )
      `.pipe(Effect.mapError((cause) => linearError("Failed to persist Linear issue run.", cause)));

      const commandPrefix = `linear:${jobId}`;
      const modelSelection =
        project.defaultModelSelection ??
        ({ provider: "codex", model: DEFAULT_MODEL_BY_PROVIDER.codex } as const);

      const threadTitle = `Linear ${input.issueIdentifier}: ${input.issueTitle}`.slice(0, 120);

      const dispatchResult = yield* Effect.exit(
        Effect.gen(function* () {
          yield* orchestrationEngine.dispatch({
            type: "thread.create",
            commandId: CommandId.make(`${commandPrefix}:thread-create`),
            threadId,
            projectId: input.projectId,
            title: threadTitle,
            modelSelection,
            runtimeMode: "full-access",
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
            branch: null,
            worktreePath: null,
            createdAt,
          });

          yield* orchestrationEngine.dispatch({
            type: "thread.archive",
            commandId: CommandId.make(`${commandPrefix}:thread-archive`),
            threadId,
          });

          yield* orchestrationEngine.dispatch({
            type: "thread.turn.start",
            commandId: CommandId.make(`${commandPrefix}:turn-start`),
            threadId,
            message: {
              messageId: MessageId.make(crypto.randomUUID()),
              role: "user",
              text: buildLinearPrompt({
                issueIdentifier: input.issueIdentifier,
                issueTitle: input.issueTitle,
                issueUrl: input.issueUrl,
                projectTitle: project.title,
              }),
              attachments: [],
            },
            runtimeMode: "full-access",
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
            createdAt,
          });
        }),
      );

      if (dispatchResult._tag === "Failure") {
        const failedAt = nowIso();
        yield* sql`
          UPDATE linear_issue_runs
          SET
            status = ${"failed" satisfies LinearIssueRunStatus},
            error = ${"Failed to start background run."},
            updated_at = ${failedAt},
            completed_at = ${failedAt}
          WHERE id = ${jobId}
        `;
      } else {
        const runningAt = nowIso();
        yield* sql`
          UPDATE linear_issue_runs
          SET
            status = ${"running" satisfies LinearIssueRunStatus},
            updated_at = ${runningAt}
          WHERE id = ${jobId}
        `;
      }

      const row = yield* loadIssueRunRowById(jobId);
      return mapIssueRun(row);
    }).pipe(Effect.mapError((cause) => linearError("Failed to start Linear issue run.", cause)));

  const cancelIssueRun: LinearIntegrationServiceShape["cancelIssueRun"] = (input) =>
    Effect.gen(function* () {
      const row = yield* loadIssueRunRowById(input.jobId);

      if (row.status === "running" || row.status === "queued") {
        yield* orchestrationEngine
          .dispatch({
            type: "thread.session.stop",
            commandId: CommandId.make(`linear:${row.id}:session-stop:${crypto.randomUUID()}`),
            threadId: row.hiddenThreadId as ThreadId,
            createdAt: nowIso(),
          })
          .pipe(Effect.ignore);
      }

      const canceledAt = nowIso();
      const next = yield* updateRunRow(input.jobId, {
        status: "canceled",
        completedAt: canceledAt,
      });
      return mapIssueRun(next);
    }).pipe(Effect.mapError((cause) => linearError("Failed to cancel Linear issue run.", cause)));

  const handleTurnCompleted: LinearIntegrationServiceShape["handleTurnCompleted"] = (input) =>
    Effect.gen(function* () {
      const runRows = (yield* sql<LinearIssueRunRow>`
        SELECT
          id,
          account_id AS "accountId",
          issue_id AS "issueId",
          issue_identifier AS "issueIdentifier",
          issue_title AS "issueTitle",
          issue_url AS "issueUrl",
          status,
          environment_id AS "environmentId",
          project_id AS "projectId",
          hidden_thread_id AS "hiddenThreadId",
          branch,
          base_branch AS "baseBranch",
          pr_url AS "prUrl",
          pr_number AS "prNumber",
          error,
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          completed_at AS "completedAt"
        FROM linear_issue_runs
        WHERE hidden_thread_id = ${input.threadId}
          AND status IN (${"queued"}, ${"running"}, ${"pr_created"})
        ORDER BY created_at DESC
        LIMIT 1
      `) as ReadonlyArray<LinearIssueRunRow>;

      const runRow = runRows[0];
      if (!runRow) {
        return;
      }

      const readModel = yield* orchestrationEngine.getReadModel();
      const thread = readModel.threads.find((entry) => entry.id === input.threadId);
      if (!thread) {
        return;
      }

      const assistantMessageId =
        input.assistantMessageId ?? thread.latestTurn?.assistantMessageId ?? null;
      const assistantMessage = assistantMessageId
        ? thread.messages.find((message) => message.id === assistantMessageId)
        : null;

      if (!assistantMessage || !hasReadyForReviewMarker(assistantMessage.text)) {
        yield* updateRunRow(runRow.id, {
          status: "completed_without_signal",
          completedAt: input.completedAt,
          error: null,
        });
        return;
      }

      const project = readModel.projects.find((entry) => entry.id === runRow.projectId);
      if (!project) {
        yield* updateRunRow(runRow.id, {
          status: "failed",
          completedAt: input.completedAt,
          error: `Project ${runRow.projectId} no longer exists.`,
        });
        return;
      }

      const cwd = thread.worktreePath ?? project.workspaceRoot;

      const prResult = yield* Effect.exit(
        Effect.gen(function* () {
          const commitPushResult = yield* gitManager.runStackedAction({
            actionId: `linear:${runRow.id}`,
            action: "commit_push",
            cwd,
            commitMessage: `${runRow.issueIdentifier}: ${runRow.issueTitle}`,
          });

          const headSelector =
            commitPushResult.push.upstreamBranch ??
            commitPushResult.push.branch ??
            commitPushResult.branch.name ??
            thread.branch ??
            null;

          if (!headSelector) {
            return yield* Effect.fail(linearError("Unable to determine head branch for PR."));
          }

          const baseBranch =
            project.defaultPrBaseBranch ?? (yield* gitHubCli.getDefaultBranch({ cwd })) ?? "main";
          const bodyPath = path.join(cwd, `.t3-linear-pr-body-${runRow.id}.md`);
          const body = [
            `Auto-created from Linear issue ${runRow.issueIdentifier}.`,
            "",
            `Linear issue: ${runRow.issueUrl}`,
            `Run id: ${runRow.id}`,
          ].join("\n");

          yield* fileSystem.writeFileString(bodyPath, `${body}\n`);
          yield* gitHubCli
            .createPullRequest({
              cwd,
              baseBranch,
              headSelector,
              title: `${runRow.issueIdentifier}: ${runRow.issueTitle}`,
              bodyFile: bodyPath,
            })
            .pipe(Effect.ensuring(fileSystem.remove(bodyPath).pipe(Effect.ignore)));

          const pullRequest = yield* gitHubCli.getPullRequest({
            cwd,
            reference: headSelector,
          });

          return {
            baseBranch,
            headSelector,
            prUrl: pullRequest.url,
            prNumber: pullRequest.number,
          };
        }),
      );

      if (prResult._tag === "Failure") {
        const errorMessage = "Failed to create pull request from Linear background run.";
        yield* updateRunRow(runRow.id, {
          status: "failed",
          completedAt: input.completedAt,
          error: errorMessage,
        });
        return;
      }

      const { baseBranch, headSelector, prUrl, prNumber } = prResult.value;
      yield* updateRunRow(runRow.id, {
        status: "pr_created",
        branch: headSelector,
        baseBranch,
        prUrl,
        prNumber,
        error: null,
      });

      const statusUpdateResult = yield* Effect.exit(
        Effect.gen(function* () {
          const apiKey = yield* loadApiKey(runRow.accountId);
          const issue = yield* linearApiClient
            .getIssue(apiKey, { issueId: runRow.issueId })
            .pipe(
              Effect.mapError((cause) =>
                linearError(
                  "Failed to read Linear issue before status update.",
                  cause instanceof LinearApiClientError ? cause.message : cause,
                ),
              ),
            );

          const reviewMappingRows = (yield* sql<LinearTeamReviewStateMappingRow>`
            SELECT
              account_id AS "accountId",
              team_id AS "teamId",
              review_state_id AS "reviewStateId",
              updated_at AS "updatedAt"
            FROM linear_team_review_state_mappings
            WHERE account_id = ${runRow.accountId}
              AND team_id = ${issue.teamId}
            LIMIT 1
          `) as ReadonlyArray<LinearTeamReviewStateMappingRow>;

          const reviewMapping = reviewMappingRows[0];
          if (!reviewMapping) {
            return "missing_mapping" as const;
          }

          yield* linearApiClient
            .updateIssueState(apiKey, {
              issueId: runRow.issueId,
              stateId: reviewMapping.reviewStateId,
            })
            .pipe(
              Effect.mapError((cause) =>
                linearError(
                  "Failed to update Linear issue state.",
                  cause instanceof LinearApiClientError ? cause.message : cause,
                ),
              ),
            );
          return "updated" as const;
        }),
      );

      if (statusUpdateResult._tag === "Failure") {
        yield* updateRunRow(runRow.id, {
          status: "pr_created",
          completedAt: input.completedAt,
          error: "Pull request created, but failed to update Linear status.",
        });
        return;
      }

      if (statusUpdateResult.value === "missing_mapping") {
        yield* updateRunRow(runRow.id, {
          status: "pr_created",
          completedAt: input.completedAt,
          error:
            "Pull request created. Missing team review-state mapping; skipped Linear status update.",
        });
        return;
      }

      yield* updateRunRow(runRow.id, {
        status: "status_updated",
        completedAt: input.completedAt,
        error: null,
      });
    }).pipe(
      Effect.mapError((cause) => linearError("Failed to process Linear run completion.", cause)),
    );

  return {
    listAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    listTeams,
    listProjects,
    listMappings,
    upsertMappings,
    listTeamReviewStateMappings,
    upsertTeamReviewStateMappings,
    listIssues,
    startIssueRun,
    listIssueRuns,
    cancelIssueRun,
    handleTurnCompleted,
  } satisfies LinearIntegrationServiceShape;
});

export const LinearIntegrationServiceLive = Layer.effect(
  LinearIntegrationService,
  makeLinearIntegrationService,
);
