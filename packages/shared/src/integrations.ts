import type { EnvironmentId, IntegrationAccountScope } from "@t3tools/contracts";

export function integrationAccountTargetEnvironmentIds(input: {
  readonly currentEnvironmentId: EnvironmentId;
  readonly allEnvironmentIds: ReadonlyArray<EnvironmentId>;
  readonly scope: IntegrationAccountScope | undefined;
}): ReadonlyArray<EnvironmentId> {
  if (input.scope === undefined || input.scope.kind === "all") {
    return [...new Set(input.allEnvironmentIds)];
  }

  const targets = new Set<EnvironmentId>([
    input.currentEnvironmentId,
    ...input.scope.environmentIds,
  ]);
  return input.allEnvironmentIds.filter((environmentId) => targets.has(environmentId));
}

export function integrationAccountScopeSummary(input: {
  readonly scope: IntegrationAccountScope | undefined;
  readonly environmentLabelById: ReadonlyMap<EnvironmentId, string>;
}): string {
  if (input.scope === undefined) {
    return "Available in all environments";
  }

  if (input.scope.kind === "all") {
    return "Available in all environments";
  }

  const labels = input.scope.environmentIds
    .map((environmentId) => input.environmentLabelById.get(environmentId))
    .filter((label): label is string => label !== undefined);

  if (labels.length === 0) {
    return "Available in all environments";
  }

  return `Available in ${labels.join(", ")}`;
}
