import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { AutomationQueueConfig } from "@t3tools/contracts";
import { Effect, Layer, Schema } from "effect";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  AutomationQueueConfigRepository,
  type AutomationQueueConfigRepositoryShape,
} from "../Services/AutomationQueueConfig.ts";

const makeAutomationQueueConfigRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRow = SqlSchema.void({
    Request: AutomationQueueConfig,
    execute: (row) =>
      sql`
        INSERT INTO automation_queue_config (
          id,
          global_concurrency,
          default_project_concurrency,
          paused,
          updated_at
        ) VALUES (
          1,
          ${row.globalConcurrency},
          ${row.defaultProjectConcurrency},
          ${row.paused},
          ${row.updatedAt}
        )
        ON CONFLICT (id) DO UPDATE SET
          global_concurrency = excluded.global_concurrency,
          default_project_concurrency = excluded.default_project_concurrency,
          paused = excluded.paused,
          updated_at = excluded.updated_at
      `,
  });

  const getRow = SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: AutomationQueueConfig,
    execute: () =>
      sql`
        SELECT
          global_concurrency AS "globalConcurrency",
          default_project_concurrency AS "defaultProjectConcurrency",
          paused,
          updated_at AS "updatedAt"
        FROM automation_queue_config
        WHERE id = 1
      `,
  });

  const upsert: AutomationQueueConfigRepositoryShape["upsert"] = (row) =>
    upsertRow(row).pipe(
      Effect.mapError(toPersistenceSqlError("AutomationQueueConfigRepository.upsert")),
    );
  const get: AutomationQueueConfigRepositoryShape["get"] = () =>
    getRow().pipe(Effect.mapError(toPersistenceSqlError("AutomationQueueConfigRepository.get")));

  return {
    upsert,
    get,
  } satisfies AutomationQueueConfigRepositoryShape;
});

export const AutomationQueueConfigRepositoryLive = Layer.effect(
  AutomationQueueConfigRepository,
  makeAutomationQueueConfigRepository,
);
