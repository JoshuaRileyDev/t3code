import { AutomationQueueConfig } from "@t3tools/contracts";
import { Context, Option, Schema } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export interface AutomationQueueConfigRepositoryShape {
  readonly upsert: (row: AutomationQueueConfig) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly get: () => Effect.Effect<
    Option.Option<AutomationQueueConfig>,
    ProjectionRepositoryError
  >;
}

export class AutomationQueueConfigRepository extends Context.Service<
  AutomationQueueConfigRepository,
  AutomationQueueConfigRepositoryShape
>()("t3/persistence/Services/AutomationQueueConfig/AutomationQueueConfigRepository") {}

export const AutomationQueueConfigPatch = Schema.Struct({
  globalConcurrency: Schema.optional(Schema.Number),
  defaultProjectConcurrency: Schema.optional(Schema.Number),
  paused: Schema.optional(Schema.Boolean),
});
export type AutomationQueueConfigPatch = typeof AutomationQueueConfigPatch.Type;
