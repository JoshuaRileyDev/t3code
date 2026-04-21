import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Existing projection table extension for per-project PR base branch.
  yield* sql`
    ALTER TABLE projection_projects
    ADD COLUMN default_pr_base_branch TEXT
  `.pipe(Effect.catch(() => Effect.void));

  yield* sql`
    CREATE TABLE IF NOT EXISTS linear_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      workspace_name TEXT NOT NULL,
      team_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS linear_team_review_state_mappings (
      account_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      review_state_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (account_id, team_id)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS linear_project_mappings (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      linear_project_id TEXT NOT NULL,
      linear_project_name TEXT NOT NULL,
      environment_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(account_id, linear_project_id, environment_id, project_id)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS linear_issue_runs (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      issue_identifier TEXT NOT NULL,
      issue_title TEXT NOT NULL,
      issue_url TEXT NOT NULL,
      status TEXT NOT NULL,
      environment_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      hidden_thread_id TEXT NOT NULL,
      branch TEXT,
      base_branch TEXT,
      pr_url TEXT,
      pr_number INTEGER,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_linear_issue_runs_status_updated
    ON linear_issue_runs(status, updated_at DESC)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_linear_issue_runs_issue
    ON linear_issue_runs(issue_id, created_at DESC)
  `;
});
