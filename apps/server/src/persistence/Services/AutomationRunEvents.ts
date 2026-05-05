import { IsoDateTime, TrimmedNonEmptyString } from "@t3tools/contracts";
import { Context, Schema } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const AutomationRunEventLevel = Schema.Literals(["info", "warning", "error"]);
export type AutomationRunEventLevel = typeof AutomationRunEventLevel.Type;

export const AutomationRunEventRow = Schema.Struct({
  id: TrimmedNonEmptyString,
  runId: TrimmedNonEmptyString,
  level: AutomationRunEventLevel,
  message: Schema.String,
  payloadJson: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
});
export type AutomationRunEventRow = typeof AutomationRunEventRow.Type;

export const ListAutomationRunEventsInput = Schema.Struct({
  runId: TrimmedNonEmptyString,
});
export type ListAutomationRunEventsInput = typeof ListAutomationRunEventsInput.Type;

export interface AutomationRunEventRepositoryShape {
  readonly append: (row: AutomationRunEventRow) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly listByRun: (
    input: ListAutomationRunEventsInput,
  ) => Effect.Effect<ReadonlyArray<AutomationRunEventRow>, ProjectionRepositoryError>;
}

export class AutomationRunEventRepository extends Context.Service<
  AutomationRunEventRepository,
  AutomationRunEventRepositoryShape
>()("t3/persistence/Services/AutomationRunEvents/AutomationRunEventRepository") {}
