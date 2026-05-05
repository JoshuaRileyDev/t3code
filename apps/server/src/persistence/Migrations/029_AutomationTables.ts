import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS automation_issues (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      acceptance_criteria TEXT,
      status TEXT NOT NULL,
      active_run_id TEXT,
      latest_thread_id TEXT,
      latest_branch TEXT,
      latest_worktree_path TEXT,
      latest_pull_request_url TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_automation_issues_project_status
    ON automation_issues (project_id, status)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS automation_issue_runs (
      id TEXT PRIMARY KEY NOT NULL,
      issue_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      thread_id TEXT,
      branch TEXT,
      worktree_path TEXT,
      pull_request_url TEXT,
      log_summary TEXT,
      error_message TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_automation_issue_runs_issue_created
    ON automation_issue_runs (issue_id, created_at DESC)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_automation_issue_runs_status
    ON automation_issue_runs (status)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS automation_queue_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      global_concurrency INTEGER NOT NULL,
      default_project_concurrency INTEGER NOT NULL,
      paused INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS automation_run_events (
      id TEXT PRIMARY KEY NOT NULL,
      run_id TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_automation_run_events_run_created
    ON automation_run_events (run_id, created_at ASC)
  `;
});
