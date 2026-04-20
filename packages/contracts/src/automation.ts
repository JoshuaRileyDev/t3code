import { Effect, Schema } from "effect";
import {
  IsoDateTime,
  PositiveInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ModelSelection } from "./orchestration.ts";

export const AutomationId = TrimmedNonEmptyString;
export type AutomationId = typeof AutomationId.Type;

export const AutomationStatus = Schema.Literals(["active", "paused"]);
export type AutomationStatus = typeof AutomationStatus.Type;

export const AutomationPermissionMode = Schema.Literals(["read-only", "full-access"]);
export type AutomationPermissionMode = typeof AutomationPermissionMode.Type;

export const AutomationProjectEnvMode = Schema.Literals(["local", "worktree"]);
export type AutomationProjectEnvMode = typeof AutomationProjectEnvMode.Type;

export const ScheduleWeekday = Schema.Literals(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
export type ScheduleWeekday = typeof ScheduleWeekday.Type;

export const ScheduleTime = TrimmedNonEmptyString.check(Schema.isPattern(/^\d{2}:\d{2}$/));
export type ScheduleTime = typeof ScheduleTime.Type;

export const AutomationSchedule = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("hourly"),
    intervalHours: PositiveInt.check(Schema.isLessThanOrEqualTo(24)),
  }),
  Schema.Struct({
    kind: Schema.Literal("daily"),
    time: ScheduleTime,
    timezone: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    kind: Schema.Literal("weekdays"),
    time: ScheduleTime,
    timezone: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    kind: Schema.Literal("weekly"),
    days: Schema.Array(ScheduleWeekday).check(Schema.isMinLength(1)),
    time: ScheduleTime,
    timezone: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    kind: Schema.Literal("monthly"),
    dayOfMonth: PositiveInt.check(Schema.isLessThanOrEqualTo(31)),
    time: ScheduleTime,
    timezone: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    kind: Schema.Literal("yearly"),
    month: PositiveInt.check(Schema.isLessThanOrEqualTo(12)),
    dayOfMonth: PositiveInt.check(Schema.isLessThanOrEqualTo(31)),
    time: ScheduleTime,
    timezone: TrimmedNonEmptyString,
  }),
]);
export type AutomationSchedule = typeof AutomationSchedule.Type;

export const AutomationProjectConfig = Schema.Struct({
  projectId: ProjectId,
  autoCreatePr: Schema.Boolean,
  envMode: AutomationProjectEnvMode,
  permissionMode: AutomationPermissionMode,
  localBranch: Schema.NullOr(TrimmedNonEmptyString),
  worktreeBaseBranch: Schema.NullOr(TrimmedNonEmptyString),
  worktreeBranch: Schema.NullOr(TrimmedNonEmptyString),
});
export type AutomationProjectConfig = typeof AutomationProjectConfig.Type;

export const Automation = Schema.Struct({
  id: AutomationId,
  name: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  status: AutomationStatus,
  projectConfig: Schema.NullOr(AutomationProjectConfig).pipe(
    Schema.withDecodingDefault(Effect.succeed(null)),
  ),
  targetThreadId: Schema.NullOr(ThreadId),
  modelSelection: ModelSelection,
  schedule: AutomationSchedule,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  lastRunAt: Schema.NullOr(IsoDateTime),
  nextRunAt: Schema.NullOr(IsoDateTime),
});
export type Automation = typeof Automation.Type;

export const AutomationRunStatus = Schema.Literals(["running", "succeeded", "failed"]);
export type AutomationRunStatus = typeof AutomationRunStatus.Type;

export const AutomationRunTrigger = Schema.Literals(["manual", "scheduled"]);
export type AutomationRunTrigger = typeof AutomationRunTrigger.Type;

export const AutomationRun = Schema.Struct({
  id: TrimmedNonEmptyString,
  automationId: AutomationId,
  trigger: AutomationRunTrigger,
  status: AutomationRunStatus,
  startedAt: IsoDateTime,
  finishedAt: Schema.NullOr(IsoDateTime),
  error: Schema.NullOr(Schema.String),
  createdThreadId: Schema.NullOr(ThreadId),
  pullRequestUrl: Schema.NullOr(Schema.String),
});
export type AutomationRun = typeof AutomationRun.Type;

export const AutomationListResult = Schema.Struct({
  automations: Schema.Array(Automation),
});
export type AutomationListResult = typeof AutomationListResult.Type;

export const AutomationRunsListInput = Schema.Struct({
  automationId: AutomationId,
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(200))),
});
export type AutomationRunsListInput = typeof AutomationRunsListInput.Type;

export const AutomationRunsClearInput = Schema.Struct({
  automationId: AutomationId,
});
export type AutomationRunsClearInput = typeof AutomationRunsClearInput.Type;

export const AutomationRunsListResult = Schema.Struct({
  runs: Schema.Array(AutomationRun),
});
export type AutomationRunsListResult = typeof AutomationRunsListResult.Type;

export const AutomationCreateInput = Schema.Struct({
  name: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  projectConfig: Schema.NullOr(AutomationProjectConfig),
  modelSelection: ModelSelection,
  schedule: AutomationSchedule,
});
export type AutomationCreateInput = typeof AutomationCreateInput.Type;

export const AutomationUpdateInput = Schema.Struct({
  id: AutomationId,
  name: Schema.optional(TrimmedNonEmptyString),
  prompt: Schema.optional(TrimmedNonEmptyString),
  projectConfig: Schema.optional(Schema.NullOr(AutomationProjectConfig)),
  modelSelection: Schema.optional(ModelSelection),
  schedule: Schema.optional(AutomationSchedule),
  status: Schema.optional(AutomationStatus),
});
export type AutomationUpdateInput = typeof AutomationUpdateInput.Type;

export const AutomationIdInput = Schema.Struct({
  id: AutomationId,
});
export type AutomationIdInput = typeof AutomationIdInput.Type;

export class AutomationError extends Schema.TaggedErrorClass<AutomationError>()("AutomationError", {
  message: TrimmedNonEmptyString,
  cause: Schema.optional(Schema.Defect),
}) {}
