import { Context } from "effect";
import type { Effect } from "effect";

import type { AutomationEngineError } from "../Errors.ts";

export interface AutomationQueueShape {
  readonly tick: () => Effect.Effect<void, AutomationEngineError>;
}

export class AutomationQueue extends Context.Service<AutomationQueue, AutomationQueueShape>()(
  "t3/automation/Services/AutomationQueue",
) {}
