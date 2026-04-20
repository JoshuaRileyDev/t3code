import * as SqlClient from "effect/unstable/sql/SqlClient";
import { Effect, Layer, Schema } from "effect";
import { Webhook, WebhookDelivery } from "@t3tools/contracts";

import { toPersistenceSqlError } from "../../persistence/Errors.ts";
import { WebhookStore, type WebhookStoreShape } from "../Services/WebhookStore.ts";

const decodeWebhook = Schema.decodeUnknownEffect(Webhook);
const decodeWebhookDelivery = Schema.decodeUnknownEffect(WebhookDelivery);

const makeWebhookStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const listWebhooks: WebhookStoreShape["listWebhooks"] = () =>
    Effect.gen(function* () {
      const rows = yield* sql<{
        readonly id: string;
        readonly name: string;
        readonly promptTemplate: string;
        readonly status: string;
        readonly projectConfig: string | null;
        readonly modelSelection: string;
        readonly createdAt: string;
        readonly updatedAt: string;
        readonly lastReceivedAt: string | null;
      }>`
        SELECT
          id,
          name,
          prompt_template AS "promptTemplate",
          status,
          project_config_json AS "projectConfig",
          model_selection_json AS "modelSelection",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          last_received_at AS "lastReceivedAt"
        FROM webhooks
        ORDER BY created_at DESC, id DESC
      `;
      const webhooks: Array<Webhook> = [];
      for (const row of rows) {
        const decoded = yield* decodeWebhook({
          id: row.id,
          name: row.name,
          promptTemplate: row.promptTemplate,
          status: row.status,
          projectConfig: row.projectConfig !== null ? JSON.parse(row.projectConfig) : null,
          modelSelection: JSON.parse(row.modelSelection),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          lastReceivedAt: row.lastReceivedAt,
        });
        webhooks.push(decoded);
      }
      return webhooks;
    }).pipe(Effect.mapError(toPersistenceSqlError("WebhookStore.listWebhooks")));

  const listDeliveries: WebhookStoreShape["listDeliveries"] = () =>
    Effect.gen(function* () {
      const rows = yield* sql<{
        readonly id: string;
        readonly webhookId: string;
        readonly status: string;
        readonly receivedAt: string;
        readonly processedAt: string | null;
        readonly headersJson: string;
        readonly queryJson: string;
        readonly bodyRaw: string;
        readonly bodyJson: string | null;
        readonly error: string | null;
      }>`
        SELECT
          id,
          webhook_id AS "webhookId",
          status,
          received_at AS "receivedAt",
          processed_at AS "processedAt",
          headers_json AS "headersJson",
          query_json AS "queryJson",
          body_raw AS "bodyRaw",
          body_json AS "bodyJson",
          error
        FROM webhook_deliveries
        ORDER BY received_at DESC, id DESC
      `;
      const deliveries: Array<WebhookDelivery> = [];
      for (const row of rows) {
        const decoded = yield* decodeWebhookDelivery({
          id: row.id,
          webhookId: row.webhookId,
          status: row.status,
          receivedAt: row.receivedAt,
          processedAt: row.processedAt,
          headersJson: row.headersJson,
          queryJson: row.queryJson,
          bodyRaw: row.bodyRaw,
          bodyJson: row.bodyJson,
          error: row.error,
        });
        deliveries.push(decoded);
      }
      return deliveries;
    }).pipe(Effect.mapError(toPersistenceSqlError("WebhookStore.listDeliveries")));

  const upsertWebhook: WebhookStoreShape["upsertWebhook"] = (webhook) =>
    sql`
      INSERT INTO webhooks (
        id,
        name,
        prompt_template,
        status,
        project_config_json,
        model_selection_json,
        created_at,
        updated_at,
        last_received_at
      )
      VALUES (
        ${webhook.id},
        ${webhook.name},
        ${webhook.promptTemplate},
        ${webhook.status},
        ${webhook.projectConfig !== null ? JSON.stringify(webhook.projectConfig) : null},
        ${JSON.stringify(webhook.modelSelection)},
        ${webhook.createdAt},
        ${webhook.updatedAt},
        ${webhook.lastReceivedAt}
      )
      ON CONFLICT (id)
      DO UPDATE SET
        name = excluded.name,
        prompt_template = excluded.prompt_template,
        status = excluded.status,
        project_config_json = excluded.project_config_json,
        model_selection_json = excluded.model_selection_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        last_received_at = excluded.last_received_at
    `.pipe(Effect.asVoid, Effect.mapError(toPersistenceSqlError("WebhookStore.upsertWebhook")));

  const upsertDelivery: WebhookStoreShape["upsertDelivery"] = (delivery) =>
    sql`
      INSERT INTO webhook_deliveries (
        id,
        webhook_id,
        status,
        received_at,
        processed_at,
        headers_json,
        query_json,
        body_raw,
        body_json,
        error,
        created_at
      )
      VALUES (
        ${delivery.id},
        ${delivery.webhookId},
        ${delivery.status},
        ${delivery.receivedAt},
        ${delivery.processedAt},
        ${delivery.headersJson},
        ${delivery.queryJson},
        ${delivery.bodyRaw},
        ${delivery.bodyJson},
        ${delivery.error},
        ${delivery.receivedAt}
      )
      ON CONFLICT (id)
      DO UPDATE SET
        webhook_id = excluded.webhook_id,
        status = excluded.status,
        received_at = excluded.received_at,
        processed_at = excluded.processed_at,
        headers_json = excluded.headers_json,
        query_json = excluded.query_json,
        body_raw = excluded.body_raw,
        body_json = excluded.body_json,
        error = excluded.error
    `.pipe(Effect.asVoid, Effect.mapError(toPersistenceSqlError("WebhookStore.upsertDelivery")));

  const deleteWebhookAndDeliveries: WebhookStoreShape["deleteWebhookAndDeliveries"] = (id) =>
    Effect.gen(function* () {
      yield* sql`DELETE FROM webhook_deliveries WHERE webhook_id = ${id}`;
      yield* sql`DELETE FROM webhooks WHERE id = ${id}`;
    }).pipe(Effect.mapError(toPersistenceSqlError("WebhookStore.deleteWebhookAndDeliveries")));

  return {
    listWebhooks,
    listDeliveries,
    upsertWebhook,
    upsertDelivery,
    deleteWebhookAndDeliveries,
  } satisfies WebhookStoreShape;
});

export const WebhookStoreLive = Layer.effect(WebhookStore, makeWebhookStore);
