import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_projects
    ADD COLUMN default_thread_env_mode TEXT
  `;

  yield* sql`
    ALTER TABLE projection_projects
    ADD COLUMN default_worktree_base_branch TEXT
  `;
});
