import { type Automation, type AutomationRun } from "@t3tools/contracts";
import { Context } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export interface AutomationStoreShape {
  readonly listAutomations: () => Effect.Effect<
    ReadonlyArray<Automation>,
    ProjectionRepositoryError
  >;
  readonly listRuns: () => Effect.Effect<ReadonlyArray<AutomationRun>, ProjectionRepositoryError>;
  readonly upsertAutomation: (
    automation: Automation,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly upsertRun: (run: AutomationRun) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly clearRuns: (automationId: string) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly deleteAutomationAndRuns: (id: string) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class AutomationStore extends Context.Service<AutomationStore, AutomationStoreShape>()(
  "t3/automation/Services/AutomationStore",
) {}
