import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Effect, Layer, Schema } from "effect";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  AutomationRunRepository,
  AutomationRunRow,
  GetAutomationRunInput,
  type AutomationRunRepositoryShape,
} from "../Services/AutomationRuns.ts";

const makeAutomationRunRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRow = SqlSchema.void({
    Request: AutomationRunRow,
    execute: (row) =>
      sql`
        INSERT INTO automation_issue_runs (
          id,
          issue_id,
          project_id,
          status,
          thread_id,
          branch,
          worktree_path,
          pull_request_url,
          log_summary,
          error_message,
          started_at,
          finished_at,
          created_at,
          updated_at
        ) VALUES (
          ${row.id},
          ${row.issueId},
          ${row.projectId},
          ${row.status},
          ${row.threadId},
          ${row.branch},
          ${row.worktreePath},
          ${row.pullRequestUrl},
          ${row.logSummary},
          ${row.errorMessage},
          ${row.startedAt},
          ${row.finishedAt},
          ${row.createdAt},
          ${row.updatedAt}
        )
        ON CONFLICT (id) DO UPDATE SET
          issue_id = excluded.issue_id,
          project_id = excluded.project_id,
          status = excluded.status,
          thread_id = excluded.thread_id,
          branch = excluded.branch,
          worktree_path = excluded.worktree_path,
          pull_request_url = excluded.pull_request_url,
          log_summary = excluded.log_summary,
          error_message = excluded.error_message,
          started_at = excluded.started_at,
          finished_at = excluded.finished_at,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `,
  });

  const getRow = SqlSchema.findOneOption({
    Request: GetAutomationRunInput,
    Result: AutomationRunRow,
    execute: ({ id }) =>
      sql`
        SELECT
          id,
          issue_id AS "issueId",
          project_id AS "projectId",
          status,
          thread_id AS "threadId",
          branch,
          worktree_path AS "worktreePath",
          pull_request_url AS "pullRequestUrl",
          log_summary AS "logSummary",
          error_message AS "errorMessage",
          started_at AS "startedAt",
          finished_at AS "finishedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM automation_issue_runs
        WHERE id = ${id}
      `,
  });

  const listRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: AutomationRunRow,
    execute: () =>
      sql`
        SELECT
          id,
          issue_id AS "issueId",
          project_id AS "projectId",
          status,
          thread_id AS "threadId",
          branch,
          worktree_path AS "worktreePath",
          pull_request_url AS "pullRequestUrl",
          log_summary AS "logSummary",
          error_message AS "errorMessage",
          started_at AS "startedAt",
          finished_at AS "finishedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM automation_issue_runs
        ORDER BY created_at DESC, id DESC
      `,
  });

  const listActiveRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: AutomationRunRow,
    execute: () =>
      sql`
        SELECT
          id,
          issue_id AS "issueId",
          project_id AS "projectId",
          status,
          thread_id AS "threadId",
          branch,
          worktree_path AS "worktreePath",
          pull_request_url AS "pullRequestUrl",
          log_summary AS "logSummary",
          error_message AS "errorMessage",
          started_at AS "startedAt",
          finished_at AS "finishedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM automation_issue_runs
        WHERE status IN ('queued', 'running', 'recovering')
        ORDER BY created_at ASC, id ASC
      `,
  });

  return {
    upsert: (row) =>
      upsertRow(row).pipe(Effect.mapError(toPersistenceSqlError("AutomationRunRepository.upsert"))),
    getById: (input) =>
      getRow(input).pipe(Effect.mapError(toPersistenceSqlError("AutomationRunRepository.getById"))),
    listAll: () =>
      listRows().pipe(Effect.mapError(toPersistenceSqlError("AutomationRunRepository.listAll"))),
    listActive: () =>
      listActiveRows().pipe(
        Effect.mapError(toPersistenceSqlError("AutomationRunRepository.listActive")),
      ),
  } satisfies AutomationRunRepositoryShape;
});

export const AutomationRunRepositoryLive = Layer.effect(
  AutomationRunRepository,
  makeAutomationRunRepository,
);
