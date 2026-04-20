import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ModelSelection, type ProviderKind } from "@t3tools/contracts";
import { useMemo, useState } from "react";

import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import { isElectron } from "~/env";
import { useServerProviders } from "~/rpc/serverState";
import { useSettings, useUpdateSettings } from "~/hooks/useSettings";
import {
  getDefaultServerModel,
  getProviderModels,
  getProviderModelCapabilities,
} from "~/providerModels";
import {
  webhookCreateMutationOptions,
  webhookDeleteMutationOptions,
  webhookDeliveriesQueryOptions,
  webhookListQueryOptions,
  webhookPauseMutationOptions,
  webhookResumeMutationOptions,
  webhookTestMutationOptions,
  webhookUpdateMutationOptions,
} from "~/lib/webhookReactQuery";

interface FormState {
  name: string;
  promptTemplate: string;
  provider: ProviderKind;
  model: string;
}

function createInitialForm(provider: ProviderKind, model: string): FormState {
  return {
    name: "",
    promptTemplate: "",
    provider,
    model,
  };
}

function toModelSelection(form: FormState): ModelSelection {
  return {
    provider: form.provider,
    model: form.model,
  };
}

function WebhooksRouteView() {
  const queryClient = useQueryClient();
  const providers = useServerProviders();
  const settings = useSettings() as {
    webhooks?: {
      enabled?: boolean;
      serverUrl?: string;
      authToken?: string;
    };
  };
  const { updateSettings } = useUpdateSettings();
  const webhookSettings = {
    enabled: settings.webhooks?.enabled ?? false,
    serverUrl: settings.webhooks?.serverUrl ?? "",
    authToken: settings.webhooks?.authToken ?? "",
  };

  const defaultProvider: ProviderKind =
    providers.find((provider) => provider.enabled)?.provider ?? "codex";
  const defaultModel = getDefaultServerModel(providers, defaultProvider);

  const webhooksQuery = useQuery(webhookListQueryOptions());
  const webhooks = webhooksQuery.data?.webhooks ?? [];
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const selectedWebhook = webhooks.find((webhook) => webhook.id === selectedWebhookId) ?? null;

  const [form, setForm] = useState<FormState>(() =>
    createInitialForm(defaultProvider, defaultModel),
  );

  const deliveriesQuery = useQuery(
    webhookDeliveriesQueryOptions({
      webhookId: selectedWebhookId ?? "",
      limit: 20,
    }),
  );

  const createMutation = useMutation(webhookCreateMutationOptions({ queryClient }));
  const updateMutation = useMutation(webhookUpdateMutationOptions({ queryClient }));
  const deleteMutation = useMutation(webhookDeleteMutationOptions({ queryClient }));
  const pauseMutation = useMutation(webhookPauseMutationOptions({ queryClient }));
  const resumeMutation = useMutation(webhookResumeMutationOptions({ queryClient }));
  const testMutation = useMutation(webhookTestMutationOptions({ queryClient }));

  const providerModels = useMemo(
    () => getProviderModels(providers, form.provider),
    [providers, form.provider],
  );
  const selectedModelCapabilities = useMemo(
    () => getProviderModelCapabilities(providerModels, form.model, form.provider),
    [providerModels, form.model, form.provider],
  );

  const endpointBase = webhookSettings.serverUrl.trim().replace(/\/+$/, "");
  const endpointUrl =
    endpointBase.length > 0 && selectedWebhook ? `${endpointBase}/i/${selectedWebhook.id}` : "";

  return (
    <SidebarInset className="h-full min-h-0">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <div className="text-sm font-medium">Webhooks</div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="space-y-3 overflow-auto rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">All webhooks</h2>
            <Button
              size="sm"
              onClick={() => {
                setSelectedWebhookId(null);
                setForm(createInitialForm(defaultProvider, defaultModel));
              }}
            >
              New
            </Button>
          </div>
          {webhooks.map((webhook) => (
            <button
              key={webhook.id}
              type="button"
              className={`w-full rounded-md border px-3 py-2 text-left ${
                selectedWebhookId === webhook.id ? "border-primary bg-primary/5" : ""
              }`}
              onClick={() => {
                setSelectedWebhookId(webhook.id);
                setForm({
                  name: webhook.name,
                  promptTemplate: webhook.promptTemplate,
                  provider: webhook.modelSelection.provider,
                  model: webhook.modelSelection.model,
                });
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{webhook.name}</span>
                <span className="text-xs text-muted-foreground">{webhook.status}</span>
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{webhook.id}</div>
            </button>
          ))}
          {webhooks.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              No webhooks yet.
            </div>
          ) : null}
        </section>

        <section className="space-y-4 overflow-auto rounded-lg border bg-card p-4">
          <div className="space-y-3 rounded-md border p-3">
            <h2 className="text-sm font-semibold">Webhook Server</h2>
            <label className="grid gap-1.5 text-xs">
              <span>Enabled</span>
              <select
                value={webhookSettings.enabled ? "true" : "false"}
                className="rounded-md border bg-background px-2 py-2 text-sm"
                onChange={(event) =>
                  updateSettings({
                    webhooks: {
                      ...webhookSettings,
                      enabled: event.target.value === "true",
                    },
                  } as never)
                }
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-xs">
              <span>Server URL</span>
              <Input
                value={webhookSettings.serverUrl}
                placeholder="https://webhooks.example.com"
                onChange={(event) =>
                  updateSettings({
                    webhooks: {
                      ...webhookSettings,
                      serverUrl: event.target.value,
                    },
                  } as never)
                }
              />
            </label>
            <label className="grid gap-1.5 text-xs">
              <span>Auth Token</span>
              <Input
                value={webhookSettings.authToken}
                placeholder="Optional token"
                onChange={(event) =>
                  updateSettings({
                    webhooks: {
                      ...webhookSettings,
                      authToken: event.target.value,
                    },
                  } as never)
                }
              />
            </label>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <h2 className="text-sm font-semibold">
              {selectedWebhook ? "Edit webhook" : "Create webhook"}
            </h2>
            <label className="grid gap-1.5 text-xs">
              <span>Name</span>
              <Input
                value={form.name}
                placeholder="Build completed"
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label className="grid gap-1.5 text-xs">
              <span>Prompt Template</span>
              <Textarea
                rows={6}
                value={form.promptTemplate}
                placeholder="Summarize this payload: {{payload}}"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, promptTemplate: event.target.value }))
                }
              />
            </label>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-xs">
                <span>Provider</span>
                <select
                  value={form.provider}
                  className="rounded-md border bg-background px-2 py-2 text-sm"
                  onChange={(event) => {
                    const provider = event.target.value as ProviderKind;
                    const model = getDefaultServerModel(providers, provider);
                    setForm((prev) => ({ ...prev, provider, model }));
                  }}
                >
                  {providers.map((provider) => (
                    <option key={provider.provider} value={provider.provider}>
                      {provider.provider}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs">
                <span>Model</span>
                <select
                  value={form.model}
                  className="rounded-md border bg-background px-2 py-2 text-sm"
                  onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
                >
                  {providerModels.map((model) => (
                    <option key={model.slug} value={model.slug}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="text-xs text-muted-foreground">
              {selectedModelCapabilities.reasoningEffortLevels.length > 0
                ? "Reasoning supported."
                : "Standard model."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  if (!form.name.trim() || !form.promptTemplate.trim()) {
                    toastManager.add({
                      type: "error",
                      title: "Name and prompt template are required.",
                    });
                    return;
                  }
                  try {
                    if (selectedWebhook) {
                      await updateMutation.mutateAsync({
                        id: selectedWebhook.id,
                        name: form.name.trim(),
                        promptTemplate: form.promptTemplate.trim(),
                        modelSelection: toModelSelection(form),
                        projectConfig: null,
                      });
                    } else {
                      const created = await createMutation.mutateAsync({
                        name: form.name.trim(),
                        promptTemplate: form.promptTemplate.trim(),
                        modelSelection: toModelSelection(form),
                        projectConfig: null,
                      });
                      setSelectedWebhookId(created.id);
                    }
                  } catch (error) {
                    toastManager.add({
                      type: "error",
                      title: "Could not save webhook.",
                      description: error instanceof Error ? error.message : undefined,
                    });
                  }
                }}
              >
                {selectedWebhook ? "Save" : "Create"}
              </Button>
              {selectedWebhook ? (
                <>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        if (selectedWebhook.status === "active") {
                          await pauseMutation.mutateAsync({ id: selectedWebhook.id });
                        } else {
                          await resumeMutation.mutateAsync({ id: selectedWebhook.id });
                        }
                      } catch (error) {
                        toastManager.add({
                          type: "error",
                          title: "Could not update webhook status.",
                          description: error instanceof Error ? error.message : undefined,
                        });
                      }
                    }}
                  >
                    {selectedWebhook.status === "active" ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await testMutation.mutateAsync({ id: selectedWebhook.id });
                      } catch (error) {
                        toastManager.add({
                          type: "error",
                          title: "Could not send test webhook.",
                          description: error instanceof Error ? error.message : undefined,
                        });
                      }
                    }}
                  >
                    Send test
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      try {
                        await deleteMutation.mutateAsync({ id: selectedWebhook.id });
                        setSelectedWebhookId(null);
                        setForm(createInitialForm(defaultProvider, defaultModel));
                      } catch (error) {
                        toastManager.add({
                          type: "error",
                          title: "Could not delete webhook.",
                          description: error instanceof Error ? error.message : undefined,
                        });
                      }
                    }}
                  >
                    Delete
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <h2 className="text-sm font-semibold">Endpoint</h2>
            <Input
              value={endpointUrl}
              readOnly
              placeholder="Select a webhook to view endpoint URL"
            />
            <p className="text-xs text-muted-foreground">
              Webhook URL format is <code>/i/&lt;webhook-id&gt;</code> on your configured webhook
              server.
            </p>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <h2 className="text-sm font-semibold">Recent deliveries</h2>
            {selectedWebhook ? (
              <>
                {(deliveriesQuery.data?.deliveries ?? []).map((delivery) => (
                  <div key={delivery.id} className="rounded border p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono">{delivery.id}</span>
                      <span>{delivery.status}</span>
                    </div>
                    <div className="mt-1 text-muted-foreground">{delivery.receivedAt}</div>
                  </div>
                ))}
                {(deliveriesQuery.data?.deliveries ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground">No deliveries yet.</div>
                ) : null}
              </>
            ) : (
              <div className="text-xs text-muted-foreground">
                Select a webhook to view deliveries.
              </div>
            )}
          </div>
        </section>
      </div>
      {!isElectron ? (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          Running in browser mode. Webhook UI works without desktop features.
        </div>
      ) : null}
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/webhooks")({
  component: WebhooksRouteView,
});
