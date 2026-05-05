import type { AutomationIssue, AutomationRun } from "@t3tools/contracts";
import { Duration, Effect, Exit, Layer } from "effect";

import { AutomationEngine } from "../Services/AutomationEngine.ts";
import { AutomationQueue, type AutomationQueueShape } from "../Services/AutomationQueue.ts";
import { AutomationRunWorker } from "../Services/AutomationRunWorker.ts";
import { AutomationEngineLive } from "./AutomationEngine.ts";
import { AutomationRunWorkerLive } from "./AutomationRunWorker.ts";

const QUEUE_POLL_INTERVAL = Duration.seconds(2);

function nowIso(): string {
  return new Date().toISOString();
}

function selectNextIssue(
  issues: ReadonlyArray<AutomationIssue>,
  queueConfig: { readonly globalConcurrency: number; readonly paused: boolean },
  runs: ReadonlyArray<AutomationRun>,
): AutomationIssue | null {
  if (queueConfig.paused) return null;
  const activeRuns = runs.filter((run) => run.status === "running" || run.status === "recovering");
  if (activeRuns.length >= queueConfig.globalConcurrency) return null;
  return issues.find((issue) => issue.status === "queued") ?? null;
}

const makeAutomationQueue = Effect.gen(function* () {
  const automationEngine = yield* AutomationEngine;
  const worker = yield* AutomationRunWorker;

  const tick: AutomationQueueShape["tick"] = () =>
    Effect.gen(function* () {
      const snapshot = yield* automationEngine.getBoardSnapshot();
      const nextIssue = selectNextIssue(snapshot.issues, snapshot.queueConfig, snapshot.runs);
      if (!nextIssue) return;

      const runId = crypto.randomUUID();
      const now = nowIso();
      const run: AutomationRun = {
        id: runId,
        issueId: nextIssue.id,
        projectId: nextIssue.projectId,
        status: "running",
        threadId: null,
        branch: null,
        worktreePath: null,
        pullRequestUrl: null,
        logSummary: null,
        errorMessage: null,
        startedAt: now,
        finishedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      yield* automationEngine.upsertRun(run);
      yield* automationEngine.setIssueStatusInternal({
        issueId: nextIssue.id,
        status: "running",
        activeRunId: runId,
        failureReason: null,
      });

      const workerExit = yield* worker.executeRun({ issue: nextIssue, run }).pipe(Effect.exit);
      const result =
        workerExit._tag === "Success"
          ? workerExit.value
          : {
              status: "failed" as const,
              summary: "Automation run failed",
              errorMessage: String(workerExit.cause),
            };

      const completedAt = nowIso();
      yield* automationEngine.upsertRun({
        ...run,
        status: result.status === "succeeded" ? "succeeded" : result.status,
        threadId: (result.threadId as never) ?? run.threadId,
        branch: result.branch ?? run.branch,
        worktreePath: result.worktreePath ?? run.worktreePath,
        pullRequestUrl: result.pullRequestUrl ?? run.pullRequestUrl,
        logSummary: result.summary,
        errorMessage: result.errorMessage ?? null,
        finishedAt: completedAt,
        updatedAt: completedAt,
      });

      yield* automationEngine.setIssueStatusInternal({
        issueId: nextIssue.id,
        status: result.status === "succeeded" ? "done" : "failed",
        activeRunId: null,
        failureReason:
          result.status === "succeeded" ? null : (result.errorMessage ?? result.summary),
      });
    });

  const queueLoop = Effect.forever(
    Effect.gen(function* () {
      const tickExit = yield* tick().pipe(Effect.exit);
      if (Exit.isFailure(tickExit)) {
        yield* Effect.logWarning("automation queue tick failed", {
          cause: String(tickExit.cause),
        });
      }
      yield* Effect.sleep(QUEUE_POLL_INTERVAL);
    }),
  );

  yield* queueLoop.pipe(Effect.forkScoped);

  return {
    tick,
  } satisfies AutomationQueueShape;
});

export const AutomationQueueLive = Layer.effect(AutomationQueue, makeAutomationQueue).pipe(
  Layer.provideMerge(AutomationRunWorkerLive),
  Layer.provideMerge(AutomationEngineLive),
  Layer.provideMerge(
    Layer.effectDiscard(
      Effect.logInfo("automation queue worker started", {
        pollIntervalMs: Duration.toMillis(QUEUE_POLL_INTERVAL),
      }),
    ),
  ),
);
