import type { AutomationIssue, AutomationRun } from "@t3tools/contracts";
import { Context } from "effect";
import type { Effect } from "effect";

import type { AutomationEngineError } from "../Errors.ts";

export interface AutomationRunWorkerShape {
  readonly executeRun: (input: {
    readonly issue: AutomationIssue;
    readonly run: AutomationRun;
  }) => Effect.Effect<AutomationRunResult, AutomationEngineError>;
  readonly resumeRecoveredRun: (input: {
    readonly issue: AutomationIssue;
    readonly run: AutomationRun;
  }) => Effect.Effect<AutomationRunResult, AutomationEngineError>;
}

export interface AutomationRunResult {
  readonly status: "succeeded" | "failed" | "canceled";
  readonly summary: string;
  readonly errorMessage?: string;
  readonly threadId?: string;
  readonly branch?: string;
  readonly worktreePath?: string;
  readonly pullRequestUrl?: string;
}

export class AutomationRunWorker extends Context.Service<
  AutomationRunWorker,
  AutomationRunWorkerShape
>()("t3/automation/Services/AutomationRunWorker") {}
