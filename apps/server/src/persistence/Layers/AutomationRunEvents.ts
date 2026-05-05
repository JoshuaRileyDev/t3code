import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Effect, Layer } from "effect";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  AutomationRunEventRepository,
  AutomationRunEventRow,
  ListAutomationRunEventsInput,
  type AutomationRunEventRepositoryShape,
} from "../Services/AutomationRunEvents.ts";

const makeAutomationRunEventRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const appendRow = SqlSchema.void({
    Request: AutomationRunEventRow,
    execute: (row) =>
      sql`
        INSERT INTO automation_run_events (
          id,
          run_id,
          level,
          message,
          payload_json,
          created_at
        ) VALUES (
          ${row.id},
          ${row.runId},
          ${row.level},
          ${row.message},
          ${row.payloadJson},
          ${row.createdAt}
        )
      `,
  });

  const listRows = SqlSchema.findAll({
    Request: ListAutomationRunEventsInput,
    Result: AutomationRunEventRow,
    execute: ({ runId }) =>
      sql`
        SELECT
          id,
          run_id AS "runId",
          level,
          message,
          payload_json AS "payloadJson",
          created_at AS "createdAt"
        FROM automation_run_events
        WHERE run_id = ${runId}
        ORDER BY created_at ASC, id ASC
      `,
  });

  return {
    append: (row) =>
      appendRow(row).pipe(
        Effect.mapError(toPersistenceSqlError("AutomationRunEventRepository.append")),
      ),
    listByRun: (input) =>
      listRows(input).pipe(
        Effect.mapError(toPersistenceSqlError("AutomationRunEventRepository.listByRun")),
      ),
  } satisfies AutomationRunEventRepositoryShape;
});

export const AutomationRunEventRepositoryLive = Layer.effect(
  AutomationRunEventRepository,
  makeAutomationRunEventRepository,
);
