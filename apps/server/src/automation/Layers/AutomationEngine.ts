import type {
  AutomationBoardEvent,
  AutomationBoardSnapshot,
  AutomationIssue,
  AutomationQueueConfig,
  AutomationRun,
  AutomationRunEvent,
} from "@t3tools/contracts";
import { Effect, Layer, Option, PubSub, Stream } from "effect";

import { AutomationIssueRepositoryLive } from "../../persistence/Layers/AutomationIssues.ts";
import { AutomationQueueConfigRepositoryLive } from "../../persistence/Layers/AutomationQueueConfig.ts";
import { AutomationRunEventRepositoryLive } from "../../persistence/Layers/AutomationRunEvents.ts";
import { AutomationRunRepositoryLive } from "../../persistence/Layers/AutomationRuns.ts";
import { AutomationIssueRepository } from "../../persistence/Services/AutomationIssues.ts";
import { AutomationQueueConfigRepository } from "../../persistence/Services/AutomationQueueConfig.ts";
import { AutomationRunEventRepository } from "../../persistence/Services/AutomationRunEvents.ts";
import { AutomationRunRepository } from "../../persistence/Services/AutomationRuns.ts";
import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import { AutomationEngineError } from "../Errors.ts";
import { AutomationEngine, type AutomationEngineShape } from "../Services/AutomationEngine.ts";

function nowIso(): string {
  return new Date().toISOString();
}

function fail(message: string): AutomationEngineError {
  return new AutomationEngineError({ message });
}

function fromRepoError(error: ProjectionRepositoryError): AutomationEngineError {
  return new AutomationEngineError({
    message: `${error._tag}: ${"message" in error ? error.message : "Repository operation failed"}`,
    cause: error,
  });
}

function toIssueModel(row: {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string;
  readonly acceptanceCriteria: string | null;
  readonly status: AutomationIssue["status"];
  readonly activeRunId: string | null;
  readonly latestThreadId: string | null;
  readonly latestBranch: string | null;
  readonly latestWorktreePath: string | null;
  readonly latestPullRequestUrl: string | null;
  readonly failureReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}): AutomationIssue {
  return {
    id: row.id,
    projectId: row.projectId as never,
    title: row.title,
    description: row.description,
    ...(row.acceptanceCriteria !== null ? { acceptanceCriteria: row.acceptanceCriteria } : {}),
    status: row.status,
    activeRunId: row.activeRunId,
    latestThreadId: row.latestThreadId as never,
    latestBranch: row.latestBranch,
    latestWorktreePath: row.latestWorktreePath,
    latestPullRequestUrl: row.latestPullRequestUrl,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const makeAutomationEngine = Effect.gen(function* () {
  const bus = yield* PubSub.unbounded<AutomationBoardEvent>();
  const issueRepo = yield* AutomationIssueRepository;
  const runRepo = yield* AutomationRunRepository;
  const runEventRepo = yield* AutomationRunEventRepository;
  const queueRepo = yield* AutomationQueueConfigRepository;

  const publish = (event: AutomationBoardEvent) => PubSub.publish(bus, event).pipe(Effect.asVoid);
  const mapRepoError = <A>(effect: Effect.Effect<A, ProjectionRepositoryError>) =>
    effect.pipe(Effect.mapError(fromRepoError));

  const resolveQueueConfig = () =>
    mapRepoError(queueRepo.get()).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => {
            const config: AutomationQueueConfig = {
              globalConcurrency: 2,
              defaultProjectConcurrency: 1,
              paused: false,
              updatedAt: nowIso(),
            };
            return mapRepoError(queueRepo.upsert(config)).pipe(Effect.as(config));
          },
          onSome: (config) => Effect.succeed(config),
        }),
      ),
    );

  const getBoardSnapshot: AutomationEngineShape["getBoardSnapshot"] = () =>
    Effect.all({
      issues: mapRepoError(issueRepo.listAll()),
      runs: mapRepoError(runRepo.listAll()),
      queueConfig: resolveQueueConfig(),
    }).pipe(
      Effect.map(
        ({ issues, runs, queueConfig }): AutomationBoardSnapshot => ({
          issues: issues.map(toIssueModel),
          runs: runs as ReadonlyArray<AutomationRun>,
          queueConfig,
        }),
      ),
    );

  const publishIssueById = (issueId: string) =>
    mapRepoError(issueRepo.getById({ id: issueId })).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.void,
          onSome: (row) => publish({ kind: "issue-upserted", issue: toIssueModel(row) }),
        }),
      ),
    );

  const createIssue: AutomationEngineShape["createIssue"] = (input) =>
    Effect.gen(function* () {
      const ts = nowIso();
      const issueId = crypto.randomUUID();
      yield* mapRepoError(
        issueRepo.upsert({
          id: issueId,
          projectId: input.projectId,
          title: input.title,
          description: input.description,
          acceptanceCriteria: input.acceptanceCriteria ?? null,
          status: "backlog",
          activeRunId: null,
          latestThreadId: null,
          latestBranch: null,
          latestWorktreePath: null,
          latestPullRequestUrl: null,
          failureReason: null,
          createdAt: ts,
          updatedAt: ts,
        }),
      );
      const persisted = yield* mapRepoError(issueRepo.getById({ id: issueId }));
      if (Option.isNone(persisted)) return yield* fail("Failed to create automation issue");
      const issue = toIssueModel(persisted.value);
      yield* publish({ kind: "issue-upserted", issue });
      return issue;
    });

  const updateIssue: AutomationEngineShape["updateIssue"] = (input) =>
    Effect.gen(function* () {
      const persisted = yield* mapRepoError(issueRepo.getById({ id: input.issueId }));
      if (Option.isNone(persisted)) return yield* fail(`Issue ${input.issueId} not found`);
      const current = persisted.value;
      yield* mapRepoError(
        issueRepo.upsert({
          ...current,
          title: input.title ?? current.title,
          description: input.description ?? current.description,
          acceptanceCriteria:
            input.acceptanceCriteria !== undefined
              ? input.acceptanceCriteria
              : current.acceptanceCriteria,
          updatedAt: nowIso(),
        }),
      );
      yield* publishIssueById(input.issueId);
      const updated = yield* mapRepoError(issueRepo.getById({ id: input.issueId }));
      if (Option.isNone(updated)) return yield* fail(`Issue ${input.issueId} not found`);
      return toIssueModel(updated.value);
    });

  const setIssueStatus = (
    issueId: string,
    status: AutomationIssue["status"],
    options?: {
      clearFailureReason?: boolean;
      activeRunId?: string | null;
      failureReason?: string | null;
    },
  ) =>
    Effect.gen(function* () {
      const persisted = yield* mapRepoError(issueRepo.getById({ id: issueId }));
      if (Option.isNone(persisted)) return yield* fail(`Issue ${issueId} not found`);
      const current = persisted.value;
      yield* mapRepoError(
        issueRepo.upsert({
          ...current,
          status,
          activeRunId:
            options && "activeRunId" in options
              ? (options.activeRunId ?? null)
              : current.activeRunId,
          failureReason: options?.clearFailureReason
            ? null
            : options && "failureReason" in options
              ? (options.failureReason ?? null)
              : current.failureReason,
          updatedAt: nowIso(),
        }),
      );
      yield* publishIssueById(issueId);
      const updated = yield* mapRepoError(issueRepo.getById({ id: issueId }));
      if (Option.isNone(updated)) return yield* fail(`Issue ${issueId} not found`);
      return toIssueModel(updated.value);
    });

  const moveIssue: AutomationEngineShape["moveIssue"] = (input) =>
    setIssueStatus(input.issueId, input.status);
  const enqueueIssue: AutomationEngineShape["enqueueIssue"] = (input) =>
    setIssueStatus(input.issueId, "queued");
  const pauseIssue: AutomationEngineShape["pauseIssue"] = (input) =>
    setIssueStatus(input.issueId, "paused");
  const cancelIssue: AutomationEngineShape["cancelIssue"] = (input) =>
    setIssueStatus(input.issueId, "canceled");
  const retryIssue: AutomationEngineShape["retryIssue"] = (input) =>
    setIssueStatus(input.issueId, "queued", { clearFailureReason: true });

  const updateQueueConfig: AutomationEngineShape["updateQueueConfig"] = (input) =>
    resolveQueueConfig().pipe(
      Effect.flatMap((current) => {
        const next: AutomationQueueConfig = {
          globalConcurrency: input.globalConcurrency ?? current.globalConcurrency,
          defaultProjectConcurrency:
            input.defaultProjectConcurrency ?? current.defaultProjectConcurrency,
          paused: input.paused ?? current.paused,
          updatedAt: nowIso(),
        };
        return mapRepoError(queueRepo.upsert(next)).pipe(
          Effect.flatMap(() => publish({ kind: "queue-config-updated", queueConfig: next })),
          Effect.as(next),
        );
      }),
    );

  const getRunEvents: AutomationEngineShape["getRunEvents"] = (input) =>
    mapRepoError(runEventRepo.listByRun({ runId: input.runId })).pipe(
      Effect.map((rows) => rows as ReadonlyArray<AutomationRunEvent>),
    );

  const upsertRun: AutomationEngineShape["upsertRun"] = (run) =>
    mapRepoError(runRepo.upsert(run as never)).pipe(
      Effect.flatMap(() => publish({ kind: "run-upserted", run })),
      Effect.as(run),
    );

  const setIssueStatusInternal: AutomationEngineShape["setIssueStatusInternal"] = (input) =>
    setIssueStatus(input.issueId, input.status, {
      ...(input.activeRunId !== undefined ? { activeRunId: input.activeRunId } : {}),
      ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
    });

  yield* getBoardSnapshot().pipe(
    Effect.flatMap((snapshot) => publish({ kind: "snapshot", snapshot })),
  );

  return {
    createIssue,
    updateIssue,
    moveIssue,
    enqueueIssue,
    pauseIssue,
    cancelIssue,
    retryIssue,
    getBoardSnapshot,
    getRunEvents,
    updateQueueConfig,
    upsertRun,
    setIssueStatusInternal,
    get subscribeBoard() {
      return Stream.fromPubSub(bus);
    },
  } satisfies AutomationEngineShape;
});

export const AutomationEngineLive = Layer.effect(AutomationEngine, makeAutomationEngine).pipe(
  Layer.provideMerge(AutomationIssueRepositoryLive),
  Layer.provideMerge(AutomationRunRepositoryLive),
  Layer.provideMerge(AutomationRunEventRepositoryLive),
  Layer.provideMerge(AutomationQueueConfigRepositoryLive),
);
