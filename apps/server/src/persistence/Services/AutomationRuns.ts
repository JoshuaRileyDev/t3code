import {
  AutomationRunStatus,
  IsoDateTime,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";
import { Context, Option, Schema } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const AutomationRunRow = Schema.Struct({
  id: TrimmedNonEmptyString,
  issueId: TrimmedNonEmptyString,
  projectId: ProjectId,
  status: AutomationRunStatus,
  threadId: Schema.NullOr(ThreadId),
  branch: Schema.NullOr(TrimmedNonEmptyString),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  pullRequestUrl: Schema.NullOr(TrimmedNonEmptyString),
  logSummary: Schema.NullOr(Schema.String),
  errorMessage: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(IsoDateTime),
  finishedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AutomationRunRow = typeof AutomationRunRow.Type;

export const GetAutomationRunInput = Schema.Struct({
  id: TrimmedNonEmptyString,
});
export type GetAutomationRunInput = typeof GetAutomationRunInput.Type;

export interface AutomationRunRepositoryShape {
  readonly upsert: (row: AutomationRunRow) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getById: (
    input: GetAutomationRunInput,
  ) => Effect.Effect<Option.Option<AutomationRunRow>, ProjectionRepositoryError>;
  readonly listAll: () => Effect.Effect<ReadonlyArray<AutomationRunRow>, ProjectionRepositoryError>;
  readonly listActive: () => Effect.Effect<
    ReadonlyArray<AutomationRunRow>,
    ProjectionRepositoryError
  >;
}

export class AutomationRunRepository extends Context.Service<
  AutomationRunRepository,
  AutomationRunRepositoryShape
>()("t3/persistence/Services/AutomationRuns/AutomationRunRepository") {}
