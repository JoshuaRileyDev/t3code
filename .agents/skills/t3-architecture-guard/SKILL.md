# T3 Architecture Guard

## Purpose

Use this skill to keep a monorepo aligned with the T3 Code architecture style:

- performance- and reliability-first behavior
- explicit package boundaries and protocol contracts
- deterministic behavior under load, reconnects, partial streams, and restarts
- maintainable structure with low duplication

This skill is reusable across projects that want this same shape (server + web + contracts + shared runtime utilities).

## When To Use

Trigger this skill when a request involves any of:

- adding/changing provider/session/runtime orchestration logic
- changing websocket or RPC event flow
- introducing new domain events or shared protocol schemas
- adding shared runtime helpers used by both server and web
- large refactors where architectural consistency matters

## Architecture Contract

### 1) Package boundaries are strict

- `apps/server`: runtime adapters, orchestration, persistence, transport, provider lifecycle.
- `apps/web`: view state, rendering, client projections, local UX logic.
- `packages/contracts`: schemas + types only. No runtime side effects.
- `packages/shared`: reusable runtime utilities with explicit subpath exports.

Never move server-only runtime behavior into contracts.
Never add web-specific UI behavior into shared runtime helpers.

### 2) Contracts-first changes

For new cross-boundary behavior:

1. define/update schema in `packages/contracts`
2. implement server behavior that emits/consumes it
3. project/use it in web
4. add tests at the boundary where failure would be hardest to debug

### 3) Deterministic orchestration

- prefer idempotent commands and stable identifiers
- preserve event ordering guarantees when transforming streams
- handle reconnect/resume explicitly
- avoid hidden implicit state transitions

### 4) Layered runtime composition

Follow the existing Effect layering style:

- keep Services as contracts
- keep Layers as concrete wiring
- compose dependencies in one place (server runtime composition)
- avoid circular runtime dependencies by extracting shared domain logic

### 5) Reliability over convenience

When tradeoffs appear:

- pick correctness over smaller local diffs
- add guardrails for partial failure paths
- fail explicitly with typed domain errors
- avoid best-effort behavior that can silently desync client/server state

## Implementation Workflow

1. Read affected package boundaries first.
2. Search for existing shared logic before adding new local logic.
3. Extract duplicate behavior into shared modules when used in 2+ places.
4. Keep transport concerns separate from domain logic.
5. Add/adjust tests nearest the changed invariants.
6. Run required quality gates.

## Quality Gates (Required)

From repo root, all of the following must pass:

```bash
bun fmt
bun lint
bun typecheck
```

Test command policy:

- Do not run `bun test`.
- Use `bun run test` when tests are needed.

## PR / Change Checklist

- boundaries respected across server/web/contracts/shared
- no duplicated business logic introduced
- event/command/schema changes versioned coherently
- failure/retry/reconnect behavior accounted for
- quality gates pass

## Anti-Patterns To Reject

- runtime code in contracts package
- ad-hoc websocket payloads that bypass contracts
- hidden cross-package imports that violate boundaries
- fixing bugs only in UI projection when source-of-truth is server domain state
- copy-paste orchestration logic instead of shared extraction

## Reuse Notes

To use this on another project:

1. copy this folder into that repo’s `.agents/skills/`
2. adapt package names while keeping the same boundaries
3. keep the contracts-first + reliability-first workflow unchanged
