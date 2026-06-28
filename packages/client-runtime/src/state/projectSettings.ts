import type { ThreadEnvMode } from "@t3tools/contracts";

import type { EnvironmentProject } from "./models.ts";

export function resolveProjectDefaultThreadEnvMode(
  project: Pick<EnvironmentProject, "defaultThreadEnvMode">,
  fallback: ThreadEnvMode,
): ThreadEnvMode {
  return project.defaultThreadEnvMode ?? fallback;
}

export function resolveProjectDefaultWorktreeBaseBranch(
  project: Pick<EnvironmentProject, "defaultWorktreeBaseBranch">,
): string | null {
  return project.defaultWorktreeBaseBranch ?? null;
}
