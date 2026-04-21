import type {
  LinearIssue,
  LinearProject,
  LinearTeam,
  LinearWorkflowState,
} from "@t3tools/contracts";
import { Context, Data } from "effect";
import type { Effect } from "effect";

export class LinearApiClientError extends Data.TaggedError("LinearApiClientError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface LinearWorkspaceInfo {
  readonly id: string;
  readonly name: string;
}

export interface LinearApiClientShape {
  readonly getWorkspaceInfo: (
    apiKey: string,
  ) => Effect.Effect<LinearWorkspaceInfo, LinearApiClientError>;
  readonly listTeams: (
    apiKey: string,
  ) => Effect.Effect<ReadonlyArray<LinearTeam>, LinearApiClientError>;
  readonly listWorkflowStates: (
    apiKey: string,
    input: { readonly teamIds?: ReadonlyArray<string> | undefined },
  ) => Effect.Effect<ReadonlyArray<LinearWorkflowState>, LinearApiClientError>;
  readonly listProjects: (
    apiKey: string,
    input: { readonly teamIds?: ReadonlyArray<string> | undefined },
  ) => Effect.Effect<ReadonlyArray<LinearProject>, LinearApiClientError>;
  readonly listIssues: (
    apiKey: string,
    input: {
      readonly teamIds?: ReadonlyArray<string> | undefined;
      readonly projectIds?: ReadonlyArray<string> | undefined;
    },
  ) => Effect.Effect<ReadonlyArray<LinearIssue>, LinearApiClientError>;
  readonly getIssue: (
    apiKey: string,
    input: { readonly issueId: string },
  ) => Effect.Effect<LinearIssue, LinearApiClientError>;
  readonly updateIssueState: (
    apiKey: string,
    input: { readonly issueId: string; readonly stateId: string },
  ) => Effect.Effect<void, LinearApiClientError>;
}

export class LinearApiClient extends Context.Service<LinearApiClient, LinearApiClientShape>()(
  "t3/linear/Services/LinearApiClient",
) {}
