import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Effect, Layer, Schema } from "effect";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  AutomationIssueRepository,
  AutomationIssueRow,
  GetAutomationIssueInput,
  ListAutomationIssuesByStatusInput,
  type AutomationIssueRepositoryShape,
} from "../Services/AutomationIssues.ts";

const makeAutomationIssueRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRow = SqlSchema.void({
    Request: AutomationIssueRow,
    execute: (row) =>
      sql`
        INSERT INTO automation_issues (
          id,
          project_id,
          title,
          description,
          acceptance_criteria,
          status,
          active_run_id,
          latest_thread_id,
          latest_branch,
          latest_worktree_path,
          latest_pull_request_url,
          failure_reason,
          created_at,
          updated_at
        ) VALUES (
          ${row.id},
          ${row.projectId},
          ${row.title},
          ${row.description},
          ${row.acceptanceCriteria},
          ${row.status},
          ${row.activeRunId},
          ${row.latestThreadId},
          ${row.latestBranch},
          ${row.latestWorktreePath},
          ${row.latestPullRequestUrl},
          ${row.failureReason},
          ${row.createdAt},
          ${row.updatedAt}
        )
        ON CONFLICT (id) DO UPDATE SET
          project_id = excluded.project_id,
          title = excluded.title,
          description = excluded.description,
          acceptance_criteria = excluded.acceptance_criteria,
          status = excluded.status,
          active_run_id = excluded.active_run_id,
          latest_thread_id = excluded.latest_thread_id,
          latest_branch = excluded.latest_branch,
          latest_worktree_path = excluded.latest_worktree_path,
          latest_pull_request_url = excluded.latest_pull_request_url,
          failure_reason = excluded.failure_reason,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `,
  });

  const getRow = SqlSchema.findOneOption({
    Request: GetAutomationIssueInput,
    Result: AutomationIssueRow,
    execute: ({ id }) =>
      sql`
        SELECT
          id,
          project_id AS "projectId",
          title,
          description,
          acceptance_criteria AS "acceptanceCriteria",
          status,
          active_run_id AS "activeRunId",
          latest_thread_id AS "latestThreadId",
          latest_branch AS "latestBranch",
          latest_worktree_path AS "latestWorktreePath",
          latest_pull_request_url AS "latestPullRequestUrl",
          failure_reason AS "failureReason",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM automation_issues
        WHERE id = ${id}
      `,
  });

  const listRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: AutomationIssueRow,
    execute: () =>
      sql`
        SELECT
          id,
          project_id AS "projectId",
          title,
          description,
          acceptance_criteria AS "acceptanceCriteria",
          status,
          active_run_id AS "activeRunId",
          latest_thread_id AS "latestThreadId",
          latest_branch AS "latestBranch",
          latest_worktree_path AS "latestWorktreePath",
          latest_pull_request_url AS "latestPullRequestUrl",
          failure_reason AS "failureReason",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM automation_issues
        ORDER BY created_at DESC, id DESC
      `,
  });

  const listRowsByStatus = SqlSchema.findAll({
    Request: ListAutomationIssuesByStatusInput,
    Result: AutomationIssueRow,
    execute: ({ status }) =>
      sql`
        SELECT
          id,
          project_id AS "projectId",
          title,
          description,
          acceptance_criteria AS "acceptanceCriteria",
          status,
          active_run_id AS "activeRunId",
          latest_thread_id AS "latestThreadId",
          latest_branch AS "latestBranch",
          latest_worktree_path AS "latestWorktreePath",
          latest_pull_request_url AS "latestPullRequestUrl",
          failure_reason AS "failureReason",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM automation_issues
        WHERE status = ${status}
        ORDER BY updated_at ASC, created_at ASC, id ASC
      `,
  });

  const upsert: AutomationIssueRepositoryShape["upsert"] = (row) =>
    upsertRow(row).pipe(Effect.mapError(toPersistenceSqlError("AutomationIssueRepository.upsert")));

  const getById: AutomationIssueRepositoryShape["getById"] = (input) =>
    getRow(input).pipe(Effect.mapError(toPersistenceSqlError("AutomationIssueRepository.getById")));

  const listAll: AutomationIssueRepositoryShape["listAll"] = () =>
    listRows().pipe(Effect.mapError(toPersistenceSqlError("AutomationIssueRepository.listAll")));

  const listByStatus: AutomationIssueRepositoryShape["listByStatus"] = (input) =>
    listRowsByStatus(input).pipe(
      Effect.mapError(toPersistenceSqlError("AutomationIssueRepository.listByStatus")),
    );

  return {
    upsert,
    getById,
    listAll,
    listByStatus,
  } satisfies AutomationIssueRepositoryShape;
});

export const AutomationIssueRepositoryLive = Layer.effect(
  AutomationIssueRepository,
  makeAutomationIssueRepository,
);
