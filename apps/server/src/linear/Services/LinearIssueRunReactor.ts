import { Context } from "effect";
import type { Effect, Scope } from "effect";

export interface LinearIssueRunReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
}

export class LinearIssueRunReactor extends Context.Service<
  LinearIssueRunReactor,
  LinearIssueRunReactorShape
>()("t3/linear/Services/LinearIssueRunReactor") {}
