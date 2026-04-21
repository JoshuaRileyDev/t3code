import {
  type CancelLinearIssueRunInput,
  type CreateLinearAccountInput,
  type DeleteLinearAccountInput,
  type LinearAccount,
  LinearIntegrationError,
  type LinearIssueRunJob,
  type LinearProject,
  type LinearProjectMapping,
  type LinearTeam,
  type LinearTeamReviewStateMapping,
  type ListLinearIssueRunsInput,
  type ListLinearIssueRunsResult,
  type ListLinearIssuesInput,
  type ListLinearIssuesResult,
  type ListLinearProjectsInput,
  type ListLinearTeamsInput,
  type StartLinearIssueRunInput,
  type ThreadId,
  type TurnId,
  type UpdateLinearAccountInput,
  type UpsertLinearProjectMappingsInput,
  type UpsertLinearTeamReviewStateMappingsInput,
} from "@t3tools/contracts";
import { Context } from "effect";
import type { Effect } from "effect";

export interface LinearIntegrationServiceShape {
  readonly listAccounts: () => Effect.Effect<ReadonlyArray<LinearAccount>, LinearIntegrationError>;
  readonly createAccount: (
    input: CreateLinearAccountInput,
  ) => Effect.Effect<LinearAccount, LinearIntegrationError>;
  readonly updateAccount: (
    input: UpdateLinearAccountInput,
  ) => Effect.Effect<LinearAccount, LinearIntegrationError>;
  readonly deleteAccount: (
    input: DeleteLinearAccountInput,
  ) => Effect.Effect<void, LinearIntegrationError>;
  readonly listTeams: (
    input: ListLinearTeamsInput,
  ) => Effect.Effect<ReadonlyArray<LinearTeam>, LinearIntegrationError>;
  readonly listProjects: (
    input: ListLinearProjectsInput,
  ) => Effect.Effect<ReadonlyArray<LinearProject>, LinearIntegrationError>;
  readonly listMappings: () => Effect.Effect<
    ReadonlyArray<LinearProjectMapping>,
    LinearIntegrationError
  >;
  readonly upsertMappings: (
    input: UpsertLinearProjectMappingsInput,
  ) => Effect.Effect<ReadonlyArray<LinearProjectMapping>, LinearIntegrationError>;
  readonly listTeamReviewStateMappings: () => Effect.Effect<
    ReadonlyArray<LinearTeamReviewStateMapping>,
    LinearIntegrationError
  >;
  readonly upsertTeamReviewStateMappings: (
    input: UpsertLinearTeamReviewStateMappingsInput,
  ) => Effect.Effect<ReadonlyArray<LinearTeamReviewStateMapping>, LinearIntegrationError>;
  readonly listIssues: (
    input: ListLinearIssuesInput,
  ) => Effect.Effect<ListLinearIssuesResult, LinearIntegrationError>;
  readonly startIssueRun: (
    input: StartLinearIssueRunInput,
  ) => Effect.Effect<LinearIssueRunJob, LinearIntegrationError>;
  readonly listIssueRuns: (
    input: ListLinearIssueRunsInput,
  ) => Effect.Effect<ListLinearIssueRunsResult, LinearIntegrationError>;
  readonly cancelIssueRun: (
    input: CancelLinearIssueRunInput,
  ) => Effect.Effect<LinearIssueRunJob, LinearIntegrationError>;
  readonly handleTurnCompleted: (input: {
    readonly threadId: ThreadId;
    readonly turnId: TurnId;
    readonly assistantMessageId: string | null;
    readonly completedAt: string;
  }) => Effect.Effect<void, LinearIntegrationError>;
}

export class LinearIntegrationService extends Context.Service<
  LinearIntegrationService,
  LinearIntegrationServiceShape
>()("t3/linear/Services/LinearIntegrationService") {}
