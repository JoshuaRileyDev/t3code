import { Schema } from "effect";
import { TrimmedNonEmptyString } from "@t3tools/contracts";

export class AutomationEngineError extends Schema.TaggedErrorClass<AutomationEngineError>()(
  "AutomationEngineError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}
