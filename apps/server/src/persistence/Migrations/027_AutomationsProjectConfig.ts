import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    SELECT name
    FROM pragma_table_info('automations')
  `;
  const hasLegacyOutputMode = columns.some((column) => column.name === "output_mode");
  if (!hasLegacyOutputMode) {
    return;
  }

  yield* sql`
    CREATE TABLE IF NOT EXISTS automations_next (
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
    INSERT INTO automations_next (
      id,
      name,
      prompt,
      status,
      project_config_json,
      target_thread_id,
      model_selection_json,
      schedule_json,
      created_at,
      updated_at,
      last_run_at,
      next_run_at
    )
    SELECT
      id,
      name,
      prompt,
      status,
      NULL AS project_config_json,
      target_thread_id,
      model_selection_json,
      schedule_json,
      created_at,
      updated_at,
      last_run_at,
      next_run_at
    FROM automations
  `;

  yield* sql`DROP TABLE automations`;
  yield* sql`ALTER TABLE automations_next RENAME TO automations`;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_automations_status_next_run
    ON automations(status, next_run_at)
  `;
});
