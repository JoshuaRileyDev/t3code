import { Context, Effect } from "effect";
import { Webhook, WebhookDelivery } from "@t3tools/contracts";

import { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export interface WebhookStoreShape {
  readonly listWebhooks: () => Effect.Effect<ReadonlyArray<Webhook>, ProjectionRepositoryError>;
  readonly listDeliveries: () => Effect.Effect<
    ReadonlyArray<WebhookDelivery>,
    ProjectionRepositoryError
  >;
  readonly upsertWebhook: (webhook: Webhook) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly upsertDelivery: (
    delivery: WebhookDelivery,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly deleteWebhookAndDeliveries: (
    id: string,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class WebhookStore extends Context.Service<WebhookStore, WebhookStoreShape>()(
  "t3/webhook/Services/WebhookStore",
) {}
