import * as SqlClient from "effect/unstable/sql/SqlClient";
import { Effect, Layer, Schema } from "effect";
import { Automation, AutomationRun } from "@t3tools/contracts";

import { toPersistenceSqlError } from "../../persistence/Errors.ts";
import { AutomationStore, type AutomationStoreShape } from "../Services/AutomationStore.ts";

const decodeAutomation = Schema.decodeUnknownEffect(Automation);
const decodeAutomationRun = Schema.decodeUnknownEffect(AutomationRun);

const makeAutomationStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const listAutomations: AutomationStoreShape["listAutomations"] = () =>
    Effect.gen(function* () {
      const rows = yield* sql<{
        readonly id: string;
        readonly name: string;
        readonly prompt: string;
        readonly status: string;
        readonly projectConfig: string | null;
        readonly targetThreadId: string | null;
        readonly modelSelection: string;
        readonly schedule: string;
        readonly createdAt: string;
        readonly updatedAt: string;
        readonly lastRunAt: string | null;
        readonly nextRunAt: string | null;
      }>`
        SELECT
          id,
          name,
          prompt,
          status,
          project_config_json AS "projectConfig",
          target_thread_id AS "targetThreadId",
          model_selection_json AS "modelSelection",
          schedule_json AS "schedule",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          last_run_at AS "lastRunAt",
          next_run_at AS "nextRunAt"
        FROM automations
        ORDER BY created_at DESC, id DESC
      `;
      const automations: Array<Automation> = [];
      for (const row of rows) {
        const decoded = yield* decodeAutomation({
          id: row.id,
          name: row.name,
          prompt: row.prompt,
          status: row.status,
          projectConfig: row.projectConfig !== null ? JSON.parse(row.projectConfig) : null,
          targetThreadId: row.targetThreadId,
          modelSelection: JSON.parse(row.modelSelection),
          schedule: JSON.parse(row.schedule),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          lastRunAt: row.lastRunAt,
          nextRunAt: row.nextRunAt,
        });
        automations.push(decoded);
      }
      return automations;
    }).pipe(Effect.mapError(toPersistenceSqlError("AutomationStore.listAutomations")));

  const listRuns: AutomationStoreShape["listRuns"] = () =>
    Effect.gen(function* () {
      const rows = yield* sql<{
        readonly id: string;
        readonly automationId: string;
        readonly trigger: string;
        readonly status: string;
        readonly startedAt: string;
        readonly finishedAt: string | null;
        readonly error: string | null;
        readonly createdThreadId: string | null;
        readonly pullRequestUrl: string | null;
      }>`
        SELECT
          id,
          automation_id AS "automationId",
          trigger,
          status,
          started_at AS "startedAt",
          finished_at AS "finishedAt",
          error,
          created_thread_id AS "createdThreadId",
          pull_request_url AS "pullRequestUrl"
        FROM automation_runs
        ORDER BY created_at DESC, id DESC
      `;
      const runs: Array<AutomationRun> = [];
      for (const row of rows) {
        const decoded = yield* decodeAutomationRun({
          id: row.id,
          automationId: row.automationId,
          trigger: row.trigger,
          status: row.status,
          startedAt: row.startedAt,
          finishedAt: row.finishedAt,
          error: row.error,
          createdThreadId: row.createdThreadId,
          pullRequestUrl: row.pullRequestUrl,
        });
        runs.push(decoded);
      }
      return runs;
    }).pipe(Effect.mapError(toPersistenceSqlError("AutomationStore.listRuns")));

  const upsertAutomation: AutomationStoreShape["upsertAutomation"] = (automation) =>
    sql`
      INSERT INTO automations (
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
      VALUES (
        ${automation.id},
        ${automation.name},
        ${automation.prompt},
        ${automation.status},
        ${automation.projectConfig !== null ? JSON.stringify(automation.projectConfig) : null},
        ${automation.targetThreadId},
        ${JSON.stringify(automation.modelSelection)},
        ${JSON.stringify(automation.schedule)},
        ${automation.createdAt},
        ${automation.updatedAt},
        ${automation.lastRunAt},
        ${automation.nextRunAt}
      )
      ON CONFLICT (id)
      DO UPDATE SET
        name = excluded.name,
        prompt = excluded.prompt,
        status = excluded.status,
        project_config_json = excluded.project_config_json,
        target_thread_id = excluded.target_thread_id,
        model_selection_json = excluded.model_selection_json,
        schedule_json = excluded.schedule_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        last_run_at = excluded.last_run_at,
        next_run_at = excluded.next_run_at
    `.pipe(
      Effect.asVoid,
      Effect.mapError(toPersistenceSqlError("AutomationStore.upsertAutomation")),
    );

  const upsertRun: AutomationStoreShape["upsertRun"] = (run) =>
    sql`
      INSERT INTO automation_runs (
        id,
        automation_id,
        trigger,
        status,
        started_at,
        finished_at,
        error,
        created_thread_id,
        pull_request_url,
        created_at
      )
      VALUES (
        ${run.id},
        ${run.automationId},
        ${run.trigger},
        ${run.status},
        ${run.startedAt},
        ${run.finishedAt},
        ${run.error},
        ${run.createdThreadId},
        ${run.pullRequestUrl},
        ${run.startedAt}
      )
      ON CONFLICT (id)
      DO UPDATE SET
        automation_id = excluded.automation_id,
        trigger = excluded.trigger,
        status = excluded.status,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        error = excluded.error,
        created_thread_id = excluded.created_thread_id,
        pull_request_url = excluded.pull_request_url
    `.pipe(Effect.asVoid, Effect.mapError(toPersistenceSqlError("AutomationStore.upsertRun")));

  const clearRuns: AutomationStoreShape["clearRuns"] = (automationId) =>
    sql`DELETE FROM automation_runs WHERE automation_id = ${automationId}`.pipe(
      Effect.asVoid,
      Effect.mapError(toPersistenceSqlError("AutomationStore.clearRuns")),
    );

  const deleteAutomationAndRuns: AutomationStoreShape["deleteAutomationAndRuns"] = (id) =>
    Effect.gen(function* () {
      yield* sql`DELETE FROM automation_runs WHERE automation_id = ${id}`;
      yield* sql`DELETE FROM automations WHERE id = ${id}`;
    }).pipe(Effect.mapError(toPersistenceSqlError("AutomationStore.deleteAutomationAndRuns")));

  return {
    listAutomations,
    listRuns,
    upsertAutomation,
    upsertRun,
    clearRuns,
    deleteAutomationAndRuns,
  } satisfies AutomationStoreShape;
});

export const AutomationStoreLive = Layer.effect(AutomationStore, makeAutomationStore);
