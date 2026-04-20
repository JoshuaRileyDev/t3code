import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prompt_template TEXT NOT NULL,
      status TEXT NOT NULL,
      project_config_json TEXT,
      model_selection_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_received_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_webhooks_status_created
    ON webhooks(status, created_at DESC)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      status TEXT NOT NULL,
      received_at TEXT NOT NULL,
      processed_at TEXT,
      headers_json TEXT NOT NULL,
      query_json TEXT NOT NULL,
      body_raw TEXT NOT NULL,
      body_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_received
    ON webhook_deliveries(webhook_id, received_at DESC)
  `;
});
