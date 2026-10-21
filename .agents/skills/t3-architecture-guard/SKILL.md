# TypeScript Architecture Guard

## Purpose

Use this skill to enforce a high-discipline architecture and maintainability standard in TypeScript projects (including Next.js, Node services, monorepos, and full-stack apps).

Core outcomes:

- predictable behavior under failure and load
- clear module and layer boundaries
- minimal duplication with reusable abstractions
- contracts-first evolution across app boundaries
- consistently high code quality over time

## When To Use

Apply this skill whenever work includes:

- new features crossing API or package boundaries
- refactors with architectural impact
- state management, orchestration, or async workflow changes
- schema/data contract updates
- broad cleanup aimed at maintainability and consistency

## Non-Negotiable Principles

1. Correctness over convenience.
2. Reliability over cleverness.
3. Explicit boundaries over implicit coupling.
4. Reuse over duplication.
5. Small composable modules over oversized files.

## Recommended Project Shape

Adapt names as needed, but preserve separation of concerns:

- `apps/*` or `services/*`: runtime entrypoints (web, api, workers)
- `packages/contracts` or `lib/contracts`: shared schemas + types only
- `packages/shared` or `lib/shared`: framework-agnostic runtime utilities
- `packages/ui` (optional): shared presentational UI primitives

Rules:

- Keep contracts/schema packages side-effect free.
- Avoid importing runtime server logic into client bundles.
- Keep transport code (HTTP/RPC/WebSocket) separate from core domain logic.

## Architecture Rules

### 1) Contracts-first development

When behavior crosses boundaries:

1. define/update schema and types first
2. update producer (server/API)
3. update consumer (web/client)
4. add boundary-focused tests

### 2) Layering and dependency direction

Keep dependency flow one-way:

- domain does not depend on transport/UI
- application services orchestrate domain + infra
- infrastructure adapts external systems (db, APIs, queues)

Never let UI components or request handlers embed core business rules directly.

### 3) Error handling discipline

- model expected failures with typed/domain errors
- avoid swallowing errors
- keep retry/timeout behavior explicit
- include enough context in errors/logs for production debugging

### 4) State and async consistency

- use idempotent operations where feasible
- protect ordering-sensitive flows
- make reconnect/retry/restart semantics explicit
- avoid hidden shared mutable state

### 5) File/module quality bar

- each module has one clear responsibility
- prefer pure functions for core transformations
- extract repeated logic once it appears in 2+ places
- keep public APIs narrow and intentional

## Implementation Workflow

1. Understand current boundaries and invariants.
2. Identify existing shared logic before adding new code.
3. Design minimal contract changes (if needed).
4. Implement by layer (domain -> service -> transport/UI).
5. Add or update tests around invariants and failure paths.
6. Run formatting, linting, type checks, and tests.

## Naming and Organization Patterns

- Use consistent folder naming (`domain`, `services`, `infra`, `routes`, `components`, `hooks`).
- Prefer explicit module names (`UserSessionStore`, `ProjectRepository`) over generic ones (`utils`, `helpers2`).
- Keep test files adjacent to implementation when practical.

## Testing Strategy

- unit tests for pure logic and edge cases
- integration tests for boundary interactions
- e2e tests for critical user/business flows
- add regression tests for every production bug fix

Focus tests on invariants and failure behavior, not implementation details.

## Code Review Checklist

- boundaries preserved
- no duplicated business logic
- contracts and consumers updated together
- failure/retry paths handled explicitly
- observability/logging added where operationally important
- tests cover changed invariants
- formatting/lint/typecheck/tests pass

## Anti-Patterns To Reject

- ad-hoc payloads that bypass typed contracts
- cross-layer imports that invert dependencies
- large “god files” handling unrelated responsibilities
- fix-only-in-UI for bugs rooted in domain/server behavior
- copy-paste business logic instead of shared extraction
- silent catch blocks that hide failures

## Reuse Notes

To reuse in any project:

1. copy this folder into `.agents/skills/`
2. rename paths/examples to match that repo
3. keep principles and checklists unchanged

## Optional Next.js Mapping

If using Next.js App Router:

- route handlers/server actions: transport/application edge
- `lib/domain/*`: domain logic
- `lib/services/*`: orchestration and use-cases
- `lib/infra/*`: db/external integrations
- `lib/contracts/*`: zod/effect/schema contracts
- UI components remain thin and declarative
