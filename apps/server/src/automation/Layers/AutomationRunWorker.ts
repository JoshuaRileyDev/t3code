import { Duration, Effect, Layer } from "effect";

import {
  AutomationRunWorker,
  type AutomationRunWorkerShape,
} from "../Services/AutomationRunWorker.ts";

const makeAutomationRunWorker = Effect.succeed({
  executeRun: ({ issue, run }) =>
    Effect.gen(function* () {
      // Phase 3 placeholder: real codex-thread execution + checks + PR flow plugs in here.
      yield* Effect.sleep(Duration.millis(250));
      return {
        status: "succeeded" as const,
        summary: `Stub execution completed for issue ${issue.id} (run ${run.id}).`,
      };
    }),
} satisfies AutomationRunWorkerShape);

export const AutomationRunWorkerLive = Layer.effect(AutomationRunWorker, makeAutomationRunWorker);
