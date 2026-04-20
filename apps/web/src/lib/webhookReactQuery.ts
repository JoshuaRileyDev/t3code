import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import type {
  WebhookCreateInput,
  WebhookDeliveriesListInput,
  WebhookUpdateInput,
} from "@t3tools/contracts";
import { ensureLocalApi } from "~/localApi";

export const webhookQueryKeys = {
  all: ["webhooks"] as const,
  list: () => ["webhooks", "list"] as const,
  deliveries: (webhookId: string) => ["webhooks", "deliveries", webhookId] as const,
};

export function webhookListQueryOptions() {
  return queryOptions({
    queryKey: webhookQueryKeys.list(),
    queryFn: async () => ensureLocalApi().webhook.list(),
    staleTime: 5_000,
  });
}

export function webhookDeliveriesQueryOptions(input: WebhookDeliveriesListInput) {
  return queryOptions({
    queryKey: webhookQueryKeys.deliveries(input.webhookId),
    queryFn: async () =>
      ensureLocalApi().webhook.listDeliveries({
        webhookId: input.webhookId,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
      }),
    enabled: input.webhookId.length > 0,
    staleTime: 2_000,
  });
}

export function webhookCreateMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["webhooks", "create"] as const,
    mutationFn: async (payload: WebhookCreateInput) => ensureLocalApi().webhook.create(payload),
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: webhookQueryKeys.all });
    },
  });
}

export function webhookUpdateMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["webhooks", "update"] as const,
    mutationFn: async (payload: WebhookUpdateInput) => ensureLocalApi().webhook.update(payload),
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: webhookQueryKeys.all });
    },
  });
}

export function webhookDeleteMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["webhooks", "delete"] as const,
    mutationFn: async ({ id }: { id: string }) => ensureLocalApi().webhook.delete({ id }),
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: webhookQueryKeys.all });
    },
  });
}

export function webhookPauseMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["webhooks", "pause"] as const,
    mutationFn: async ({ id }: { id: string }) => ensureLocalApi().webhook.pause({ id }),
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: webhookQueryKeys.all });
    },
  });
}

export function webhookResumeMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["webhooks", "resume"] as const,
    mutationFn: async ({ id }: { id: string }) => ensureLocalApi().webhook.resume({ id }),
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: webhookQueryKeys.all });
    },
  });
}

export function webhookTestMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["webhooks", "test"] as const,
    mutationFn: async ({ id }: { id: string }) => ensureLocalApi().webhook.test({ id }),
    onSuccess: async (_result, variables) => {
      await input.queryClient.invalidateQueries({ queryKey: webhookQueryKeys.all });
      await input.queryClient.invalidateQueries({
        queryKey: webhookQueryKeys.deliveries(variables.id),
      });
    },
  });
}
