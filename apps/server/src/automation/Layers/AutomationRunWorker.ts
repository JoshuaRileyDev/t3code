import {
  CommandId,
  MessageId,
  ThreadId,
  type ModelSelection,
  type OrchestrationCommand,
} from "@t3tools/contracts";
import { Duration, Effect, Layer } from "effect";

import { GitCore } from "../../git/Services/GitCore.ts";
import { GitManager } from "../../git/Services/GitManager.ts";
import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import { runProcess } from "../../processRunner.ts";
import { AutomationEngineError } from "../Errors.ts";
import {
  AutomationRunWorker,
  type AutomationRunResult,
  type AutomationRunWorkerShape,
} from "../Services/AutomationRunWorker.ts";

const RUN_TIMEOUT_MS = 1000 * 60 * 30;
const POLL_INTERVAL = Duration.seconds(2);

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeBranchName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function buildPrompt(input: {
  readonly title: string;
  readonly description: string;
  readonly acceptanceCriteria?: string;
}): string {
  return [
    `Objective: ${input.title}`,
    "",
    "Task details:",
    input.description,
    "",
    input.acceptanceCriteria ? `Acceptance criteria: ${input.acceptanceCriteria}` : "",
    "",
    "Constraints:",
    "- Work only in this worktree.",
    "- Keep changes scoped to this issue.",
    "- Non-interactive mode: do not ask for approvals.",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

const makeAutomationRunWorker = Effect.gen(function* () {
  const git = yield* GitCore;
  const gitManager = yield* GitManager;
  const orchestrationEngine = yield* OrchestrationEngineService;

  const runChecks = (cwd: string) =>
    Effect.tryPromise({
      try: async () => {
        await runProcess("bun", ["fmt"], { cwd });
        await runProcess("bun", ["lint"], { cwd });
        await runProcess("bun", ["typecheck"], { cwd, timeoutMs: 1000 * 60 * 10 });
      },
      catch: (cause) =>
        new AutomationEngineError({
          message: "Automation quality checks failed",
          cause,
        }),
    });

  const completePostTurn = (input: {
    readonly issueTitle: string;
    readonly runId: string;
    readonly worktreePath: string;
  }) =>
    Effect.gen(function* () {
      yield* runChecks(input.worktreePath);
      const gitResult = yield* gitManager.runStackedAction({
        actionId: `automation:${input.runId}`,
        cwd: input.worktreePath,
        action: "commit_push_pr",
        commitMessage: `feat(automation): ${input.issueTitle}`,
        featureBranch: false,
      });
      return {
        summary: "Automation run completed and PR prepared",
        ...(gitResult.pr.url ? { pullRequestUrl: gitResult.pr.url } : {}),
      } as const;
    });

  const waitForTurnCompletion = (threadId: string) =>
    Effect.gen(function* () {
      const startedAt = Date.now();
      while (true) {
        if (Date.now() - startedAt > RUN_TIMEOUT_MS) {
          return yield* new AutomationEngineError({
            message: `Timed out waiting for thread completion: ${threadId}`,
          });
        }
        const readModel = yield* orchestrationEngine.getReadModel();
        const thread = readModel.threads.find((entry) => entry.id === threadId);
        if (!thread) {
          return yield* new AutomationEngineError({
            message: `Thread not found during run wait: ${threadId}`,
          });
        }
        const turnState = thread.latestTurn?.state;
        if (turnState === "completed") return;
        if (turnState === "error" || thread.session?.status === "error") {
          return yield* new AutomationEngineError({
            message: thread.session?.lastError ?? "Automation thread failed",
          });
        }
        yield* Effect.sleep(POLL_INTERVAL);
      }
    });

  const executeRun: AutomationRunWorkerShape["executeRun"] = ({ issue, run }) =>
    Effect.gen(function* () {
      const readModel = yield* orchestrationEngine.getReadModel();
      const project = readModel.projects.find((entry) => entry.id === issue.projectId);
      if (!project) {
        return yield* new AutomationEngineError({
          message: `Project not found for issue ${issue.id}`,
        });
      }

      const modelSelection: ModelSelection | null = project.defaultModelSelection ?? null;
      if (!modelSelection) {
        return yield* new AutomationEngineError({
          message: `Project ${project.id} has no default model selection`,
        });
      }

      const branch = `automation/${sanitizeBranchName(issue.title) || "issue"}-${run.id.slice(0, 8)}`;

      yield* git.execute({
        operation: "automation.fetchMain",
        cwd: project.workspaceRoot,
        args: ["fetch", "origin", "main"],
      });

      const worktree = yield* git.createWorktree({
        cwd: project.workspaceRoot,
        branch: "main",
        newBranch: branch,
        path: null,
      });

      const threadId = ThreadId.make(`automation-${run.id}`);
      const createdAt = nowIso();
      const createCommand: Extract<OrchestrationCommand, { type: "thread.create" }> = {
        type: "thread.create",
        commandId: CommandId.make(`automation:create:${run.id}`),
        threadId,
        projectId: project.id,
        title: issue.title,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: worktree.worktree.branch,
        worktreePath: worktree.worktree.path,
        createdAt,
      };

      yield* orchestrationEngine.dispatch(createCommand);

      const turnStart: Extract<OrchestrationCommand, { type: "thread.turn.start" }> = {
        type: "thread.turn.start",
        commandId: CommandId.make(`automation:turn:${run.id}`),
        threadId,
        message: {
          messageId: MessageId.make(`automation-msg-${run.id}`),
          role: "user",
          text: buildPrompt({
            title: issue.title,
            description: issue.description,
            ...(issue.acceptanceCriteria ? { acceptanceCriteria: issue.acceptanceCriteria } : {}),
          }),
          attachments: [],
        },
        modelSelection,
        titleSeed: issue.title,
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt: nowIso(),
      };

      yield* orchestrationEngine.dispatch(turnStart);
      yield* waitForTurnCompletion(threadId);
      const postTurn = yield* completePostTurn({
        issueTitle: issue.title,
        runId: run.id,
        worktreePath: worktree.worktree.path,
      });

      return {
        status: "succeeded" as const,
        summary: postTurn.summary,
        threadId,
        branch: worktree.worktree.branch,
        worktreePath: worktree.worktree.path,
        ...("pullRequestUrl" in postTurn ? { pullRequestUrl: postTurn.pullRequestUrl } : {}),
      };
    }).pipe(
      Effect.mapError(
        (cause) =>
          new AutomationEngineError({
            message: cause instanceof Error ? cause.message : "Automation execution failed",
            cause,
          }),
      ),
    );

  const resumeRecoveredRun: AutomationRunWorkerShape["resumeRecoveredRun"] = ({ issue, run }) =>
    Effect.gen(function* () {
      if (!run.threadId || !run.worktreePath) {
        return {
          status: "failed" as const,
          summary: "Recovery could not continue",
          errorMessage: "Missing thread/worktree metadata for recovery.",
        } satisfies AutomationRunResult;
      }
      yield* waitForTurnCompletion(run.threadId);
      const postTurn = yield* completePostTurn({
        issueTitle: issue.title,
        runId: run.id,
        worktreePath: run.worktreePath,
      });
      return {
        status: "succeeded" as const,
        summary: postTurn.summary,
        threadId: run.threadId,
        ...(run.branch ? { branch: run.branch } : {}),
        worktreePath: run.worktreePath,
        ...("pullRequestUrl" in postTurn ? { pullRequestUrl: postTurn.pullRequestUrl } : {}),
      } satisfies AutomationRunResult;
    }).pipe(
      Effect.mapError(
        (cause) =>
          new AutomationEngineError({
            message: cause instanceof Error ? cause.message : "Automation recovery failed",
            cause,
          }),
      ),
    );

  return {
    executeRun,
    resumeRecoveredRun,
  } satisfies AutomationRunWorkerShape;
});

export const AutomationRunWorkerLive = Layer.effect(AutomationRunWorker, makeAutomationRunWorker);
