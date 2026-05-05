import type { AutomationIssue, AutomationRun } from "@t3tools/contracts";
import { Duration, Effect, Exit, Layer, Ref } from "effect";

import { AutomationRunEventRepositoryLive } from "../../persistence/Layers/AutomationRunEvents.ts";
import { AutomationRunEventRepository } from "../../persistence/Services/AutomationRunEvents.ts";
import { AutomationRunRepository } from "../../persistence/Services/AutomationRuns.ts";
import { AutomationEngine } from "../Services/AutomationEngine.ts";
import { AutomationQueue, type AutomationQueueShape } from "../Services/AutomationQueue.ts";
import { AutomationRunWorker, type AutomationRunResult } from "../Services/AutomationRunWorker.ts";
import { AutomationEngineLive } from "./AutomationEngine.ts";
import { AutomationRunWorkerLive } from "./AutomationRunWorker.ts";

const QUEUE_POLL_INTERVAL = Duration.seconds(2);

type Candidate =
  | { readonly kind: "queued"; readonly issue: AutomationIssue; readonly run: null }
  | { readonly kind: "recovering"; readonly issue: AutomationIssue; readonly run: AutomationRun };

function nowIso(): string {
  return new Date().toISOString();
}

function groupByProject<T extends { readonly projectId: string }>(rows: ReadonlyArray<T>) {
  const map = new Map<string, ReadonlyArray<T>>();
  for (const row of rows) {
    map.set(row.projectId, [...(map.get(row.projectId) ?? []), row]);
  }
  return map;
}

function selectCandidate(input: {
  readonly snapshot: {
    readonly issues: ReadonlyArray<AutomationIssue>;
    readonly runs: ReadonlyArray<AutomationRun>;
    readonly queueConfig: {
      readonly globalConcurrency: number;
      readonly defaultProjectConcurrency: number;
      readonly paused: boolean;
    };
  };
  readonly roundRobinStart: number;
}): Candidate | null {
  const { snapshot } = input;
  if (snapshot.queueConfig.paused) return null;

  const activeRuns = snapshot.runs.filter(
    (run) => run.status === "running" || run.status === "recovering",
  );
  if (activeRuns.length >= snapshot.queueConfig.globalConcurrency) return null;

  const activeByProject = new Map<string, number>();
  for (const run of activeRuns) {
    activeByProject.set(run.projectId, (activeByProject.get(run.projectId) ?? 0) + 1);
  }

  const issueById = new Map(snapshot.issues.map((issue) => [issue.id, issue] as const));
  const recoveringRuns = snapshot.runs
    .filter((run) => run.status === "recovering")
    .map((run) => ({ run, issue: issueById.get(run.issueId) ?? null }))
    .filter(
      (entry): entry is { readonly run: AutomationRun; readonly issue: AutomationIssue } =>
        entry.issue !== null,
    );

  const queuedIssues = snapshot.issues.filter((issue) => issue.status === "queued");
  const recoveringByProject = groupByProject(
    recoveringRuns.map((entry) => ({
      projectId: entry.issue.projectId,
      run: entry.run,
      issue: entry.issue,
    })),
  );
  const queuedByProject = groupByProject(queuedIssues);

  const projectIds = Array.from(
    new Set([...recoveringByProject.keys(), ...queuedByProject.keys()]),
  ).toSorted();
  if (projectIds.length === 0) return null;

  for (let offset = 0; offset < projectIds.length; offset += 1) {
    const projectId = projectIds[(input.roundRobinStart + offset) % projectIds.length];
    if (!projectId) continue;
    const activeForProject = activeByProject.get(projectId) ?? 0;
    if (activeForProject >= snapshot.queueConfig.defaultProjectConcurrency) continue;

    const recovering = recoveringByProject.get(projectId) ?? [];
    if (recovering.length > 0) {
      const selected = recovering[0];
      if (!selected) continue;
      return { kind: "recovering", issue: selected.issue, run: selected.run };
    }

    const queued = queuedByProject.get(projectId) ?? [];
    if (queued.length > 0) {
      const issue = queued[0];
      if (!issue) continue;
      return { kind: "queued", issue, run: null };
    }
  }

  return null;
}

const makeAutomationQueue = Effect.gen(function* () {
  const automationEngine = yield* AutomationEngine;
  const worker = yield* AutomationRunWorker;
  const runRepo = yield* AutomationRunRepository;
  const runEvents = yield* AutomationRunEventRepository;
  const rrRef = yield* Ref.make(0);

  const appendRunEvent = (input: {
    readonly runId: string;
    readonly level: "info" | "warning" | "error";
    readonly message: string;
    readonly payload?: unknown;
  }) =>
    runEvents
      .append({
        id: crypto.randomUUID(),
        runId: input.runId,
        level: input.level,
        message: input.message,
        payloadJson: input.payload === undefined ? null : JSON.stringify(input.payload),
        createdAt: nowIso(),
      })
      .pipe(Effect.orDie);

  const finalizeRun = (input: {
    readonly issue: AutomationIssue;
    readonly run: AutomationRun;
    readonly result: AutomationRunResult;
  }) =>
    Effect.gen(function* () {
      const completedAt = nowIso();
      const nextRun: AutomationRun = {
        ...input.run,
        status: input.result.status === "succeeded" ? "succeeded" : input.result.status,
        threadId: (input.result.threadId as never) ?? input.run.threadId,
        branch: input.result.branch ?? input.run.branch,
        worktreePath: input.result.worktreePath ?? input.run.worktreePath,
        pullRequestUrl: input.result.pullRequestUrl ?? input.run.pullRequestUrl,
        logSummary: input.result.summary,
        errorMessage: input.result.errorMessage ?? null,
        finishedAt: completedAt,
        updatedAt: completedAt,
      };
      yield* automationEngine.upsertRun(nextRun);
      yield* automationEngine.setIssueStatusInternal({
        issueId: input.issue.id,
        status: input.result.status === "succeeded" ? "done" : "failed",
        activeRunId: null,
        failureReason:
          input.result.status === "succeeded"
            ? null
            : (input.result.errorMessage ?? input.result.summary),
      });
      yield* appendRunEvent({
        runId: input.run.id,
        level: input.result.status === "succeeded" ? "info" : "error",
        message: input.result.status === "succeeded" ? "run-finished" : "run-failed",
        payload: input.result,
      });
    });

  const recoverInFlightRuns = Effect.gen(function* () {
    const activeRuns = yield* runRepo
      .listActive()
      .pipe(Effect.catch(() => Effect.succeed([] as ReadonlyArray<AutomationRun>)));
    for (const run of activeRuns) {
      if (run.status === "queued") continue;
      yield* automationEngine.upsertRun({ ...run, status: "recovering", updatedAt: nowIso() });
      yield* automationEngine.setIssueStatusInternal({
        issueId: run.issueId,
        status: "running",
        activeRunId: run.id,
      });
      yield* appendRunEvent({
        runId: run.id,
        level: "warning",
        message: "run-marked-recovering-after-restart",
      });
    }
  }).pipe(Effect.orDie);

  const tick: AutomationQueueShape["tick"] = () =>
    Effect.gen(function* () {
      const snapshot = yield* automationEngine.getBoardSnapshot();
      const roundRobinStart = yield* Ref.get(rrRef);
      const candidate = selectCandidate({ snapshot, roundRobinStart });
      if (!candidate) return;
      yield* Ref.update(rrRef, (value) => value + 1);

      if (candidate.kind === "recovering") {
        yield* appendRunEvent({
          runId: candidate.run.id,
          level: "info",
          message: "run-recovery-attempt-started",
        });
        const recoveryExit = yield* worker
          .resumeRecoveredRun({ issue: candidate.issue, run: candidate.run })
          .pipe(Effect.exit);
        const recoveryResult: AutomationRunResult = Exit.isSuccess(recoveryExit)
          ? recoveryExit.value
          : {
              status: "failed",
              summary: "Recovery failed",
              errorMessage: String(recoveryExit.cause),
            };
        yield* finalizeRun({ issue: candidate.issue, run: candidate.run, result: recoveryResult });
        return;
      }

      const runId = crypto.randomUUID();
      const startedAt = nowIso();
      const run: AutomationRun = {
        id: runId,
        issueId: candidate.issue.id,
        projectId: candidate.issue.projectId,
        status: "running",
        threadId: null,
        branch: null,
        worktreePath: null,
        pullRequestUrl: null,
        logSummary: null,
        errorMessage: null,
        startedAt,
        finishedAt: null,
        createdAt: startedAt,
        updatedAt: startedAt,
      };

      yield* automationEngine.upsertRun(run);
      yield* automationEngine.setIssueStatusInternal({
        issueId: candidate.issue.id,
        status: "running",
        activeRunId: runId,
        failureReason: null,
      });
      yield* appendRunEvent({
        runId,
        level: "info",
        message: "run-started",
        payload: { issueId: candidate.issue.id, projectId: candidate.issue.projectId },
      });

      const workerExit = yield* worker
        .executeRun({ issue: candidate.issue, run })
        .pipe(Effect.exit);
      const result: AutomationRunResult = Exit.isSuccess(workerExit)
        ? workerExit.value
        : {
            status: "failed",
            summary: "Automation run failed",
            errorMessage: String(workerExit.cause),
          };
      yield* finalizeRun({ issue: candidate.issue, run, result });
    });

  yield* recoverInFlightRuns;

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
  Layer.provideMerge(AutomationRunEventRepositoryLive),
  Layer.provideMerge(
    Layer.effectDiscard(
      Effect.logInfo("automation queue worker started", {
        pollIntervalMs: Duration.toMillis(QUEUE_POLL_INTERVAL),
      }),
    ),
  ),
);
