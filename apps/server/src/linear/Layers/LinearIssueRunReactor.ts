import type { OrchestrationEvent } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import { Cause, Effect, Layer, Stream } from "effect";

import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import {
  LinearIssueRunReactor,
  type LinearIssueRunReactorShape,
} from "../Services/LinearIssueRunReactor.ts";
import { LinearIntegrationService } from "../Services/LinearIntegrationService.ts";

type TurnDiffCompletedEvent = Extract<OrchestrationEvent, { type: "thread.turn-diff-completed" }>;

const make = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const linearIntegrationService = yield* LinearIntegrationService;

  const processEvent = (event: TurnDiffCompletedEvent) =>
    linearIntegrationService
      .handleTurnCompleted({
        threadId: event.payload.threadId,
        turnId: event.payload.turnId,
        assistantMessageId: event.payload.assistantMessageId,
        completedAt: event.payload.completedAt,
      })
      .pipe(
        Effect.catchCause((cause) => {
          if (Cause.hasInterruptsOnly(cause)) {
            return Effect.failCause(cause);
          }
          return Effect.logWarning("linear issue run reactor failed to process completion event", {
            threadId: event.payload.threadId,
            turnId: event.payload.turnId,
            cause: Cause.pretty(cause),
          });
        }),
      );

  const worker = yield* makeDrainableWorker(processEvent);

  const start: LinearIssueRunReactorShape["start"] = Effect.fn("start")(function* () {
    yield* Effect.forkScoped(
      Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
        if (event.type !== "thread.turn-diff-completed") {
          return Effect.void;
        }
        return worker.enqueue(event);
      }),
    );
  });

  return {
    start,
  } satisfies LinearIssueRunReactorShape;
});

export const LinearIssueRunReactorLive = Layer.effect(LinearIssueRunReactor, make);
