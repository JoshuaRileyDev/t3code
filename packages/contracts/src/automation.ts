import { Effect, Schema } from "effect";
import {
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

export const AUTOMATION_WS_METHODS = {
  createIssue: "automation.createIssue",
  updateIssue: "automation.updateIssue",
  moveIssue: "automation.moveIssue",
  enqueueIssue: "automation.enqueueIssue",
  pauseIssue: "automation.pauseIssue",
  cancelIssue: "automation.cancelIssue",
  retryIssue: "automation.retryIssue",
  getBoardSnapshot: "automation.getBoardSnapshot",
  getRunEvents: "automation.getRunEvents",
  subscribeBoard: "automation.subscribeBoard",
  updateQueueConfig: "automation.updateQueueConfig",
} as const;

export const AutomationIssueStatus = Schema.Literals([
  "backlog",
  "queued",
  "running",
  "failed",
  "done",
  "paused",
  "canceled",
]);
export type AutomationIssueStatus = typeof AutomationIssueStatus.Type;

export const AutomationRunStatus = Schema.Literals([
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "recovering",
]);
export type AutomationRunStatus = typeof AutomationRunStatus.Type;

export const AutomationIssueId = TrimmedNonEmptyString;
export type AutomationIssueId = typeof AutomationIssueId.Type;

export const AutomationRunId = TrimmedNonEmptyString;
export type AutomationRunId = typeof AutomationRunId.Type;

export const AutomationIssue = Schema.Struct({
  id: AutomationIssueId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  description: Schema.String,
  acceptanceCriteria: Schema.optional(Schema.String),
  status: AutomationIssueStatus,
  activeRunId: Schema.NullOr(AutomationRunId),
  latestThreadId: Schema.NullOr(ThreadId),
  latestBranch: Schema.NullOr(TrimmedNonEmptyString),
  latestWorktreePath: Schema.NullOr(TrimmedNonEmptyString),
  latestPullRequestUrl: Schema.NullOr(TrimmedNonEmptyString),
  failureReason: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AutomationIssue = typeof AutomationIssue.Type;

export const AutomationRun = Schema.Struct({
  id: AutomationRunId,
  issueId: AutomationIssueId,
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
export type AutomationRun = typeof AutomationRun.Type;

export const AutomationRunEventLevel = Schema.Literals(["info", "warning", "error"]);
export type AutomationRunEventLevel = typeof AutomationRunEventLevel.Type;

export const AutomationRunEvent = Schema.Struct({
  id: TrimmedNonEmptyString,
  runId: AutomationRunId,
  level: AutomationRunEventLevel,
  message: Schema.String,
  payloadJson: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
});
export type AutomationRunEvent = typeof AutomationRunEvent.Type;

export const AutomationQueueConfig = Schema.Struct({
  globalConcurrency: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(2))),
  defaultProjectConcurrency: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(1))),
  paused: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  updatedAt: IsoDateTime,
});
export type AutomationQueueConfig = typeof AutomationQueueConfig.Type;

export const AutomationBoardSnapshot = Schema.Struct({
  issues: Schema.Array(AutomationIssue),
  runs: Schema.Array(AutomationRun),
  queueConfig: AutomationQueueConfig,
});
export type AutomationBoardSnapshot = typeof AutomationBoardSnapshot.Type;

export const AutomationBoardEvent = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("snapshot"),
    snapshot: AutomationBoardSnapshot,
  }),
  Schema.Struct({
    kind: Schema.Literal("issue-upserted"),
    issue: AutomationIssue,
  }),
  Schema.Struct({
    kind: Schema.Literal("issue-removed"),
    issueId: AutomationIssueId,
  }),
  Schema.Struct({
    kind: Schema.Literal("run-upserted"),
    run: AutomationRun,
  }),
  Schema.Struct({
    kind: Schema.Literal("queue-config-updated"),
    queueConfig: AutomationQueueConfig,
  }),
]);
export type AutomationBoardEvent = typeof AutomationBoardEvent.Type;

export const AutomationCreateIssueInput = Schema.Struct({
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  description: Schema.String,
  acceptanceCriteria: Schema.optional(Schema.String),
});
export type AutomationCreateIssueInput = typeof AutomationCreateIssueInput.Type;

export const AutomationUpdateIssueInput = Schema.Struct({
  issueId: AutomationIssueId,
  title: Schema.optional(TrimmedNonEmptyString),
  description: Schema.optional(Schema.String),
  acceptanceCriteria: Schema.optional(Schema.String),
});
export type AutomationUpdateIssueInput = typeof AutomationUpdateIssueInput.Type;

export const AutomationMoveIssueInput = Schema.Struct({
  issueId: AutomationIssueId,
  status: AutomationIssueStatus,
});
export type AutomationMoveIssueInput = typeof AutomationMoveIssueInput.Type;

export const AutomationIssueCommandInput = Schema.Struct({
  issueId: AutomationIssueId,
});
export type AutomationIssueCommandInput = typeof AutomationIssueCommandInput.Type;

export const AutomationGetRunEventsInput = Schema.Struct({
  runId: AutomationRunId,
});
export type AutomationGetRunEventsInput = typeof AutomationGetRunEventsInput.Type;

export const AutomationUpdateQueueConfigInput = Schema.Struct({
  globalConcurrency: Schema.optional(NonNegativeInt),
  defaultProjectConcurrency: Schema.optional(NonNegativeInt),
  paused: Schema.optional(Schema.Boolean),
});
export type AutomationUpdateQueueConfigInput = typeof AutomationUpdateQueueConfigInput.Type;

export class AutomationError extends Schema.TaggedErrorClass<AutomationError>()("AutomationError", {
  message: TrimmedNonEmptyString,
  cause: Schema.optional(Schema.Defect),
}) {}
