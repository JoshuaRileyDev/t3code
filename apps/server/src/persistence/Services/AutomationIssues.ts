import {
  AutomationIssueStatus,
  IsoDateTime,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";
import { Context, Option, Schema } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const AutomationIssueRow = Schema.Struct({
  id: TrimmedNonEmptyString,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  description: Schema.String,
  acceptanceCriteria: Schema.NullOr(Schema.String),
  status: AutomationIssueStatus,
  activeRunId: Schema.NullOr(TrimmedNonEmptyString),
  latestThreadId: Schema.NullOr(ThreadId),
  latestBranch: Schema.NullOr(TrimmedNonEmptyString),
  latestWorktreePath: Schema.NullOr(TrimmedNonEmptyString),
  latestPullRequestUrl: Schema.NullOr(TrimmedNonEmptyString),
  failureReason: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AutomationIssueRow = typeof AutomationIssueRow.Type;

export const GetAutomationIssueInput = Schema.Struct({
  id: TrimmedNonEmptyString,
});
export type GetAutomationIssueInput = typeof GetAutomationIssueInput.Type;

export const ListAutomationIssuesByStatusInput = Schema.Struct({
  status: AutomationIssueStatus,
});
export type ListAutomationIssuesByStatusInput = typeof ListAutomationIssuesByStatusInput.Type;

export interface AutomationIssueRepositoryShape {
  readonly upsert: (row: AutomationIssueRow) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getById: (
    input: GetAutomationIssueInput,
  ) => Effect.Effect<Option.Option<AutomationIssueRow>, ProjectionRepositoryError>;
  readonly listAll: () => Effect.Effect<
    ReadonlyArray<AutomationIssueRow>,
    ProjectionRepositoryError
  >;
  readonly listByStatus: (
    input: ListAutomationIssuesByStatusInput,
  ) => Effect.Effect<ReadonlyArray<AutomationIssueRow>, ProjectionRepositoryError>;
}

export class AutomationIssueRepository extends Context.Service<
  AutomationIssueRepository,
  AutomationIssueRepositoryShape
>()("t3/persistence/Services/AutomationIssues/AutomationIssueRepository") {}
