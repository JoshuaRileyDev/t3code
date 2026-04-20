import { queryOptions, mutationOptions, type QueryClient } from "@tanstack/react-query";
import type {
  AutomationCreateInput,
  AutomationUpdateInput,
  AutomationRunsListInput,
} from "@t3tools/contracts";
import { ensureLocalApi } from "~/localApi";

export const automationQueryKeys = {
  all: ["automations"] as const,
  list: () => ["automations", "list"] as const,
  runs: (automationId: string) => ["automations", "runs", automationId] as const,
};

export function automationListQueryOptions() {
  return queryOptions({
    queryKey: automationQueryKeys.list(),
    queryFn: async () => ensureLocalApi().automation.list(),
    staleTime: 5_000,
  });
}

export function automationRunsQueryOptions(input: AutomationRunsListInput) {
  return queryOptions({
    queryKey: automationQueryKeys.runs(input.automationId),
    queryFn: async () =>
      ensureLocalApi().automation.listRuns({
        automationId: input.automationId,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
      }),
    enabled: input.automationId.length > 0,
    staleTime: 2_000,
  });
}

export function automationCreateMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["automations", "create"] as const,
    mutationFn: async (payload: AutomationCreateInput) =>
      ensureLocalApi().automation.create(payload),
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: automationQueryKeys.all });
    },
  });
}

export function automationUpdateMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["automations", "update"] as const,
    mutationFn: async (payload: AutomationUpdateInput) =>
      ensureLocalApi().automation.update(payload),
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: automationQueryKeys.all });
    },
  });
}

export function automationDeleteMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["automations", "delete"] as const,
    mutationFn: async ({ id }: { id: string }) => ensureLocalApi().automation.delete({ id }),
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: automationQueryKeys.all });
    },
  });
}

export function automationRunNowMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["automations", "run-now"] as const,
    mutationFn: async ({ id }: { id: string }) => ensureLocalApi().automation.runNow({ id }),
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: automationQueryKeys.all });
    },
  });
}

export function automationPauseMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["automations", "pause"] as const,
    mutationFn: async ({ id }: { id: string }) => ensureLocalApi().automation.pause({ id }),
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: automationQueryKeys.all });
    },
  });
}

export function automationResumeMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["automations", "resume"] as const,
    mutationFn: async ({ id }: { id: string }) => ensureLocalApi().automation.resume({ id }),
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: automationQueryKeys.all });
    },
  });
}

export function automationClearRunsMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["automations", "clear-runs"] as const,
    mutationFn: async ({ automationId }: { automationId: string }) =>
      ensureLocalApi().automation.clearRuns({ automationId }),
    onSuccess: async (_result, variables) => {
      await input.queryClient.invalidateQueries({
        queryKey: automationQueryKeys.runs(variables.automationId),
      });
      await input.queryClient.invalidateQueries({ queryKey: automationQueryKeys.all });
    },
  });
}
