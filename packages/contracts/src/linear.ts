import { Effect, Schema } from "effect";
import {
  EnvironmentId,
  IsoDateTime,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

export const LinearAccountId = TrimmedNonEmptyString;
export type LinearAccountId = typeof LinearAccountId.Type;

export const LinearMappingId = TrimmedNonEmptyString;
export type LinearMappingId = typeof LinearMappingId.Type;

export const LinearIssueId = TrimmedNonEmptyString;
export type LinearIssueId = typeof LinearIssueId.Type;

export const LinearIssueIdentifier = TrimmedNonEmptyString;
export type LinearIssueIdentifier = typeof LinearIssueIdentifier.Type;

export const LinearIssueRunJobId = TrimmedNonEmptyString;
export type LinearIssueRunJobId = typeof LinearIssueRunJobId.Type;

export const LinearAccount = Schema.Struct({
  id: LinearAccountId,
  name: TrimmedNonEmptyString,
  workspaceId: TrimmedNonEmptyString,
  workspaceName: TrimmedNonEmptyString,
  teamIds: Schema.Array(TrimmedNonEmptyString).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type LinearAccount = typeof LinearAccount.Type;

export const LinearTeam = Schema.Struct({
  id: TrimmedNonEmptyString,
  key: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
});
export type LinearTeam = typeof LinearTeam.Type;

export const LinearWorkflowState = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  type: TrimmedNonEmptyString,
  teamId: TrimmedNonEmptyString,
});
export type LinearWorkflowState = typeof LinearWorkflowState.Type;

export const LinearProject = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  key: Schema.NullOr(TrimmedNonEmptyString),
  teamId: TrimmedNonEmptyString,
  teamName: TrimmedNonEmptyString,
});
export type LinearProject = typeof LinearProject.Type;

export const LinearProjectMapping = Schema.Struct({
  id: LinearMappingId,
  accountId: LinearAccountId,
  linearProjectId: TrimmedNonEmptyString,
  linearProjectName: TrimmedNonEmptyString,
  environmentId: EnvironmentId,
  projectId: ProjectId,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type LinearProjectMapping = typeof LinearProjectMapping.Type;

export const LinearIssue = Schema.Struct({
  id: LinearIssueId,
  identifier: LinearIssueIdentifier,
  title: TrimmedNonEmptyString,
  description: Schema.String,
  url: Schema.String,
  priority: Schema.Number,
  stateId: TrimmedNonEmptyString,
  stateName: TrimmedNonEmptyString,
  teamId: TrimmedNonEmptyString,
  teamName: TrimmedNonEmptyString,
  projectId: Schema.NullOr(TrimmedNonEmptyString),
  projectName: Schema.NullOr(TrimmedNonEmptyString),
  assigneeName: Schema.NullOr(TrimmedNonEmptyString),
  updatedAt: IsoDateTime,
});
export type LinearIssue = typeof LinearIssue.Type;

export const LinearIssueRunStatus = Schema.Literals([
  "queued",
  "running",
  "failed",
  "completed",
  "completed_without_signal",
  "pr_created",
  "status_updated",
  "canceled",
]);
export type LinearIssueRunStatus = typeof LinearIssueRunStatus.Type;

export const LinearIssueRunJob = Schema.Struct({
  id: LinearIssueRunJobId,
  accountId: LinearAccountId,
  issueId: LinearIssueId,
  issueIdentifier: LinearIssueIdentifier,
  issueTitle: TrimmedNonEmptyString,
  issueUrl: Schema.String,
  status: LinearIssueRunStatus,
  environmentId: EnvironmentId,
  projectId: ProjectId,
  hiddenThreadId: ThreadId,
  branch: Schema.NullOr(TrimmedNonEmptyString),
  baseBranch: Schema.NullOr(TrimmedNonEmptyString),
  prUrl: Schema.NullOr(Schema.String),
  prNumber: Schema.NullOr(Schema.Number),
  error: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  completedAt: Schema.NullOr(IsoDateTime),
});
export type LinearIssueRunJob = typeof LinearIssueRunJob.Type;

export const LinearTeamReviewStateMapping = Schema.Struct({
  accountId: LinearAccountId,
  teamId: TrimmedNonEmptyString,
  reviewStateId: TrimmedNonEmptyString,
  updatedAt: IsoDateTime,
});
export type LinearTeamReviewStateMapping = typeof LinearTeamReviewStateMapping.Type;

export const CreateLinearAccountInput = Schema.Struct({
  id: LinearAccountId,
  name: TrimmedNonEmptyString,
  apiKey: TrimmedNonEmptyString,
});
export type CreateLinearAccountInput = typeof CreateLinearAccountInput.Type;

export const UpdateLinearAccountInput = Schema.Struct({
  id: LinearAccountId,
  name: Schema.optional(TrimmedNonEmptyString),
  apiKey: Schema.optional(TrimmedNonEmptyString),
  teamIds: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
});
export type UpdateLinearAccountInput = typeof UpdateLinearAccountInput.Type;

export const DeleteLinearAccountInput = Schema.Struct({
  id: LinearAccountId,
});
export type DeleteLinearAccountInput = typeof DeleteLinearAccountInput.Type;

export const ListLinearTeamsInput = Schema.Struct({
  accountId: LinearAccountId,
});
export type ListLinearTeamsInput = typeof ListLinearTeamsInput.Type;

export const ListLinearProjectsInput = Schema.Struct({
  accountId: LinearAccountId,
});
export type ListLinearProjectsInput = typeof ListLinearProjectsInput.Type;

export const UpsertLinearProjectMappingsInput = Schema.Struct({
  mappings: Schema.Array(
    Schema.Struct({
      accountId: LinearAccountId,
      linearProjectId: TrimmedNonEmptyString,
      linearProjectName: TrimmedNonEmptyString,
      environmentId: EnvironmentId,
      projectId: ProjectId,
    }),
  ),
});
export type UpsertLinearProjectMappingsInput = typeof UpsertLinearProjectMappingsInput.Type;

export const UpsertLinearTeamReviewStateMappingsInput = Schema.Struct({
  mappings: Schema.Array(
    Schema.Struct({
      accountId: LinearAccountId,
      teamId: TrimmedNonEmptyString,
      reviewStateId: TrimmedNonEmptyString,
    }),
  ),
});
export type UpsertLinearTeamReviewStateMappingsInput =
  typeof UpsertLinearTeamReviewStateMappingsInput.Type;

export const ListLinearIssuesInput = Schema.Struct({
  accountIds: Schema.optional(Schema.Array(LinearAccountId)),
});
export type ListLinearIssuesInput = typeof ListLinearIssuesInput.Type;

export const ListLinearIssuesResult = Schema.Struct({
  issues: Schema.Array(LinearIssue),
});
export type ListLinearIssuesResult = typeof ListLinearIssuesResult.Type;

export const StartLinearIssueRunInput = Schema.Struct({
  accountId: LinearAccountId,
  issueId: LinearIssueId,
  issueIdentifier: LinearIssueIdentifier,
  issueTitle: TrimmedNonEmptyString,
  issueUrl: Schema.String,
  environmentId: EnvironmentId,
  projectId: ProjectId,
});
export type StartLinearIssueRunInput = typeof StartLinearIssueRunInput.Type;

export const ListLinearIssueRunsInput = Schema.Struct({
  accountIds: Schema.optional(Schema.Array(LinearAccountId)),
});
export type ListLinearIssueRunsInput = typeof ListLinearIssueRunsInput.Type;

export const ListLinearIssueRunsResult = Schema.Struct({
  jobs: Schema.Array(LinearIssueRunJob),
});
export type ListLinearIssueRunsResult = typeof ListLinearIssueRunsResult.Type;

export const CancelLinearIssueRunInput = Schema.Struct({
  jobId: LinearIssueRunJobId,
});
export type CancelLinearIssueRunInput = typeof CancelLinearIssueRunInput.Type;

export class LinearIntegrationError extends Schema.TaggedErrorClass<LinearIntegrationError>()(
  "LinearIntegrationError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}
