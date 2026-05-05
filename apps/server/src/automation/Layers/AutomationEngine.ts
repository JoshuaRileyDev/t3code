import type {
  AutomationBoardEvent,
  AutomationBoardSnapshot,
  AutomationIssue,
  AutomationQueueConfig,
  AutomationRun,
} from "@t3tools/contracts";
import { Effect, Layer, PubSub, Ref, Stream } from "effect";

import { AutomationEngine, type AutomationEngineShape } from "../Services/AutomationEngine.ts";
import { AutomationEngineError } from "../Errors.ts";

interface AutomationState {
  readonly issues: ReadonlyArray<AutomationIssue>;
  readonly runs: ReadonlyArray<AutomationRun>;
  readonly queueConfig: AutomationQueueConfig;
}

function nowIso(): string {
  return new Date().toISOString();
}

function fail(message: string): AutomationEngineError {
  return new AutomationEngineError({ message });
}

const makeAutomationEngine = Effect.gen(function* () {
  const bus = yield* PubSub.unbounded<AutomationBoardEvent>();
  const stateRef = yield* Ref.make<AutomationState>({
    issues: [],
    runs: [],
    queueConfig: {
      globalConcurrency: 2,
      defaultProjectConcurrency: 1,
      paused: false,
      updatedAt: nowIso(),
    },
  });

  const publish = (event: AutomationBoardEvent) => PubSub.publish(bus, event).pipe(Effect.asVoid);

  const getBoardSnapshot: AutomationEngineShape["getBoardSnapshot"] = () =>
    Ref.get(stateRef).pipe(
      Effect.map(
        (state): AutomationBoardSnapshot => ({
          issues: [...state.issues],
          runs: [...state.runs],
          queueConfig: state.queueConfig,
        }),
      ),
    );

  const updateIssueInState = (
    issueId: string,
    updater: (issue: AutomationIssue) => AutomationIssue,
  ): Effect.Effect<AutomationIssue, AutomationEngineError> =>
    Effect.gen(function* () {
      let nextIssue: AutomationIssue | null = null;
      yield* Ref.update(stateRef, (state) => {
        const nextIssues = state.issues.map((issue) => {
          if (issue.id !== issueId) return issue;
          nextIssue = updater(issue);
          return nextIssue;
        });
        return {
          ...state,
          issues: nextIssues,
        };
      });
      if (!nextIssue) return yield* fail(`Issue ${issueId} not found`);
      yield* publish({ kind: "issue-upserted", issue: nextIssue });
      return nextIssue;
    });

  const createIssue: AutomationEngineShape["createIssue"] = (input) =>
    Effect.gen(function* () {
      const ts = nowIso();
      const issue: AutomationIssue = {
        id: crypto.randomUUID(),
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        ...(input.acceptanceCriteria ? { acceptanceCriteria: input.acceptanceCriteria } : {}),
        status: "backlog",
        activeRunId: null,
        latestThreadId: null,
        latestBranch: null,
        latestWorktreePath: null,
        latestPullRequestUrl: null,
        failureReason: null,
        createdAt: ts,
        updatedAt: ts,
      };
      yield* Ref.update(stateRef, (state) => ({
        ...state,
        issues: [issue, ...state.issues],
      }));
      yield* publish({ kind: "issue-upserted", issue });
      return issue;
    });

  const updateIssue: AutomationEngineShape["updateIssue"] = (input) =>
    updateIssueInState(input.issueId, (issue) => ({
      ...issue,
      ...(input.title ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.acceptanceCriteria !== undefined
        ? { acceptanceCriteria: input.acceptanceCriteria }
        : {}),
      updatedAt: nowIso(),
    }));

  const moveIssue: AutomationEngineShape["moveIssue"] = (input) =>
    updateIssueInState(input.issueId, (issue) => ({
      ...issue,
      status: input.status,
      updatedAt: nowIso(),
    }));

  const enqueueIssue: AutomationEngineShape["enqueueIssue"] = (input) =>
    updateIssueInState(input.issueId, (issue) => ({
      ...issue,
      status: "queued",
      updatedAt: nowIso(),
    }));

  const pauseIssue: AutomationEngineShape["pauseIssue"] = (input) =>
    updateIssueInState(input.issueId, (issue) => ({
      ...issue,
      status: "paused",
      updatedAt: nowIso(),
    }));

  const cancelIssue: AutomationEngineShape["cancelIssue"] = (input) =>
    updateIssueInState(input.issueId, (issue) => ({
      ...issue,
      status: "canceled",
      updatedAt: nowIso(),
    }));

  const retryIssue: AutomationEngineShape["retryIssue"] = (input) =>
    updateIssueInState(input.issueId, (issue) => ({
      ...issue,
      status: "queued",
      failureReason: null,
      updatedAt: nowIso(),
    }));

  const updateQueueConfig: AutomationEngineShape["updateQueueConfig"] = (input) =>
    Effect.gen(function* () {
      let nextConfig: AutomationQueueConfig | null = null;
      yield* Ref.update(stateRef, (state) => {
        nextConfig = {
          globalConcurrency: input.globalConcurrency ?? state.queueConfig.globalConcurrency,
          defaultProjectConcurrency:
            input.defaultProjectConcurrency ?? state.queueConfig.defaultProjectConcurrency,
          paused: input.paused ?? state.queueConfig.paused,
          updatedAt: nowIso(),
        };
        return {
          ...state,
          queueConfig: nextConfig!,
        };
      });
      if (!nextConfig) return yield* fail("Failed to update queue config");
      yield* publish({ kind: "queue-config-updated", queueConfig: nextConfig });
      return nextConfig;
    });

  yield* publish({
    kind: "snapshot",
    snapshot: yield* getBoardSnapshot(),
  });

  return {
    createIssue,
    updateIssue,
    moveIssue,
    enqueueIssue,
    pauseIssue,
    cancelIssue,
    retryIssue,
    getBoardSnapshot,
    updateQueueConfig,
    get subscribeBoard() {
      return Stream.fromPubSub(bus);
    },
  } satisfies AutomationEngineShape;
});

export const AutomationEngineLive = Layer.effect(AutomationEngine, makeAutomationEngine);
