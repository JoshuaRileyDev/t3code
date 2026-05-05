import type {
  AutomationBoardEvent,
  AutomationBoardSnapshot,
  AutomationCreateIssueInput,
  AutomationGetRunEventsInput,
  AutomationIssue,
  AutomationIssueStatus,
  AutomationIssueCommandInput,
  AutomationMoveIssueInput,
  AutomationQueueConfig,
  AutomationRun,
  AutomationRunEvent,
  AutomationUpdateIssueInput,
  AutomationUpdateQueueConfigInput,
} from "@t3tools/contracts";
import { Context } from "effect";
import type { Effect, Stream } from "effect";

import type { AutomationEngineError } from "../Errors.ts";

export interface AutomationEngineShape {
  readonly createIssue: (
    input: AutomationCreateIssueInput,
  ) => Effect.Effect<AutomationIssue, AutomationEngineError>;
  readonly updateIssue: (
    input: AutomationUpdateIssueInput,
  ) => Effect.Effect<AutomationIssue, AutomationEngineError>;
  readonly moveIssue: (
    input: AutomationMoveIssueInput,
  ) => Effect.Effect<AutomationIssue, AutomationEngineError>;
  readonly enqueueIssue: (
    input: AutomationIssueCommandInput,
  ) => Effect.Effect<AutomationIssue, AutomationEngineError>;
  readonly pauseIssue: (
    input: AutomationIssueCommandInput,
  ) => Effect.Effect<AutomationIssue, AutomationEngineError>;
  readonly cancelIssue: (
    input: AutomationIssueCommandInput,
  ) => Effect.Effect<AutomationIssue, AutomationEngineError>;
  readonly retryIssue: (
    input: AutomationIssueCommandInput,
  ) => Effect.Effect<AutomationIssue, AutomationEngineError>;
  readonly getBoardSnapshot: () => Effect.Effect<AutomationBoardSnapshot, AutomationEngineError>;
  readonly getRunEvents: (
    input: AutomationGetRunEventsInput,
  ) => Effect.Effect<ReadonlyArray<AutomationRunEvent>, AutomationEngineError>;
  readonly updateQueueConfig: (
    input: AutomationUpdateQueueConfigInput,
  ) => Effect.Effect<AutomationQueueConfig, AutomationEngineError>;
  readonly upsertRun: (run: AutomationRun) => Effect.Effect<AutomationRun, AutomationEngineError>;
  readonly setIssueStatusInternal: (input: {
    readonly issueId: string;
    readonly status: AutomationIssueStatus;
    readonly activeRunId?: string | null;
    readonly failureReason?: string | null;
  }) => Effect.Effect<AutomationIssue, AutomationEngineError>;
  readonly subscribeBoard: Stream.Stream<AutomationBoardEvent, never, never>;
}

export class AutomationEngine extends Context.Service<AutomationEngine, AutomationEngineShape>()(
  "t3/automation/Services/AutomationEngine",
) {}
