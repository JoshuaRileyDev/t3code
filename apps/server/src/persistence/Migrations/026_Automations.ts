import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS automations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      project_config_json TEXT,
      target_thread_id TEXT,
      model_selection_json TEXT NOT NULL,
      schedule_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_run_at TEXT,
      next_run_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_automations_status_next_run
    ON automations(status, next_run_at)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS automation_runs (
      id TEXT PRIMARY KEY,
      automation_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      error TEXT,
      created_thread_id TEXT,
      pull_request_url TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_automation_runs_automation_created
    ON automation_runs(automation_id, created_at DESC)
  `;
});
