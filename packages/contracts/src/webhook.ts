import { Effect, Schema } from "effect";
import { IsoDateTime, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { AutomationProjectConfig } from "./automation.ts";
import { ModelSelection } from "./orchestration.ts";

export const WebhookId = TrimmedNonEmptyString;
export type WebhookId = typeof WebhookId.Type;

export const WebhookStatus = Schema.Literals(["active", "paused"]);
export type WebhookStatus = typeof WebhookStatus.Type;

export const WebhookDeliveryStatus = Schema.Literals(["received", "processed", "failed"]);
export type WebhookDeliveryStatus = typeof WebhookDeliveryStatus.Type;

export const Webhook = Schema.Struct({
  id: WebhookId,
  name: TrimmedNonEmptyString,
  promptTemplate: TrimmedNonEmptyString,
  status: WebhookStatus,
  projectConfig: Schema.NullOr(AutomationProjectConfig).pipe(
    Schema.withDecodingDefault(Effect.succeed(null)),
  ),
  modelSelection: ModelSelection,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  lastReceivedAt: Schema.NullOr(IsoDateTime),
});
export type Webhook = typeof Webhook.Type;

export const WebhookDelivery = Schema.Struct({
  id: TrimmedNonEmptyString,
  webhookId: WebhookId,
  status: WebhookDeliveryStatus,
  receivedAt: IsoDateTime,
  processedAt: Schema.NullOr(IsoDateTime),
  headersJson: Schema.String,
  queryJson: Schema.String,
  bodyRaw: Schema.String,
  bodyJson: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
});
export type WebhookDelivery = typeof WebhookDelivery.Type;

export const WebhookListResult = Schema.Struct({
  webhooks: Schema.Array(Webhook),
});
export type WebhookListResult = typeof WebhookListResult.Type;

export const WebhookCreateInput = Schema.Struct({
  name: TrimmedNonEmptyString,
  promptTemplate: TrimmedNonEmptyString,
  projectConfig: Schema.NullOr(AutomationProjectConfig),
  modelSelection: ModelSelection,
});
export type WebhookCreateInput = typeof WebhookCreateInput.Type;

export const WebhookUpdateInput = Schema.Struct({
  id: WebhookId,
  name: Schema.optional(TrimmedNonEmptyString),
  promptTemplate: Schema.optional(TrimmedNonEmptyString),
  projectConfig: Schema.optional(Schema.NullOr(AutomationProjectConfig)),
  modelSelection: Schema.optional(ModelSelection),
  status: Schema.optional(WebhookStatus),
});
export type WebhookUpdateInput = typeof WebhookUpdateInput.Type;

export const WebhookIdInput = Schema.Struct({
  id: WebhookId,
});
export type WebhookIdInput = typeof WebhookIdInput.Type;

export const WebhookDeliveriesListInput = Schema.Struct({
  webhookId: WebhookId,
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(200))),
});
export type WebhookDeliveriesListInput = typeof WebhookDeliveriesListInput.Type;

export const WebhookDeliveriesListResult = Schema.Struct({
  deliveries: Schema.Array(WebhookDelivery),
});
export type WebhookDeliveriesListResult = typeof WebhookDeliveriesListResult.Type;

export const WebhookTestInput = Schema.Struct({
  id: WebhookId,
});
export type WebhookTestInput = typeof WebhookTestInput.Type;

export class WebhookError extends Schema.TaggedErrorClass<WebhookError>()("WebhookError", {
  message: TrimmedNonEmptyString,
  cause: Schema.optional(Schema.Defect),
}) {}
