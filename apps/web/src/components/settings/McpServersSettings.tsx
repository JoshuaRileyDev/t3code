"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useAtomValue } from "@effect/atom-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  defaultInstanceIdForDriver,
  PROVIDER_DISPLAY_NAMES,
  ProviderDriverKind,
  EnvironmentId,
  type ProviderInstanceConfig,
  ProviderInstanceId,
  type ServerProvider,
  type UnifiedSettings,
} from "@t3tools/contracts";
import { type McpServerConfig, type McpServerConfigMap } from "@t3tools/contracts";

import { buildProviderInstanceUpdatePatch } from "./SettingsPanels.logic";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { useEnvironment, useEnvironments, usePrimaryEnvironment } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentSettings, useUpdateEnvironmentSettings } from "../../hooks/useSettings";

type McpTransport = McpServerConfig["transport"];
type McpEnvironmentEntry = { readonly id: string; readonly key: string; readonly value: string };

interface SupportedProviderRow {
  readonly instanceId: ProviderInstanceId;
  readonly driver: ProviderDriverKind;
  readonly instance: ProviderInstanceConfig;
  readonly liveProvider: ServerProvider | undefined;
  readonly isDefault: boolean;
}

interface EditableMcpServerDraft {
  readonly name: string;
  readonly transport: McpTransport;
  readonly command: string;
  readonly argsText: string;
  readonly url: string;
  readonly env: ReadonlyArray<McpEnvironmentEntry>;
  readonly headers: ReadonlyArray<McpEnvironmentEntry>;
  readonly selectedProviderIds: ReadonlySet<ProviderInstanceId>;
}

const MCP_SUPPORTED_DRIVER_KINDS = new Set<ProviderDriverKind>([
  ProviderDriverKind.make("codex"),
  ProviderDriverKind.make("claudeAgent"),
]);

const EMPTY_MCP_SERVER_MAP: McpServerConfigMap = {};
let draftEntryCounter = 0;

function nextDraftEntryId(prefix: string) {
  draftEntryCounter += 1;
  return `${prefix}-${draftEntryCounter}`;
}

function trimNonEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function splitLines(text: string): ReadonlyArray<string> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseDraftPairs(entries: ReadonlyArray<McpEnvironmentEntry>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const entry of entries) {
    const key = entry.key.trim();
    if (!key) continue;
    next[key] = entry.value;
  }
  return next;
}

function cloneEntries(entries: Record<string, string>): ReadonlyArray<McpEnvironmentEntry> {
  return Object.entries(entries).map(([key, value]) => ({
    id: nextDraftEntryId(key),
    key,
    value,
  }));
}

function getConfigMcpServers(config: ProviderInstanceConfig["config"]): McpServerConfigMap {
  const record = config as { readonly mcpServers?: McpServerConfigMap } | undefined;
  return record?.mcpServers ?? EMPTY_MCP_SERVER_MAP;
}

function getMcpServerSummary(server: McpServerConfig): string {
  switch (server.transport) {
    case "command":
      return [server.command, ...server.args].join(" ").trim();
    case "http":
    case "sse":
      return server.url;
  }
}

function getMcpServerSubtitle(server: McpServerConfig): string {
  switch (server.transport) {
    case "command":
      return [
        `${server.args.length} arg${server.args.length === 1 ? "" : "s"}`,
        `${Object.keys(server.env).length} env`,
      ].join(" · ");
    case "http":
    case "sse":
      return `${Object.keys(server.headers).length} header${Object.keys(server.headers).length === 1 ? "" : "s"}`;
  }
}

function instanceLabel(provider: ServerProvider): string {
  return provider.displayName ?? PROVIDER_DISPLAY_NAMES[provider.driver] ?? provider.driver;
}

function instanceLabelFromRow(row: SupportedProviderRow): string {
  return row.liveProvider
    ? instanceLabel(row.liveProvider)
    : (PROVIDER_DISPLAY_NAMES[row.driver] ?? row.driver);
}

function buildSupportedProviderRows(input: {
  readonly settings: UnifiedSettings;
  readonly serverProviders: ReadonlyArray<ServerProvider> | null;
}): ReadonlyArray<SupportedProviderRow> {
  const settings = input.settings;
  const supportedRows: Array<SupportedProviderRow> = [];
  const serverProviders = input.serverProviders ?? [];
  const customRowsById = new Map<ProviderInstanceId, SupportedProviderRow>();

  for (const [rawId, instance] of Object.entries(settings.providerInstances ?? {})) {
    if (!MCP_SUPPORTED_DRIVER_KINDS.has(instance.driver)) {
      continue;
    }
    const instanceId = ProviderInstanceId.make(rawId);
    customRowsById.set(instanceId, {
      instanceId,
      driver: instance.driver,
      instance,
      liveProvider: serverProviders.find((provider) => provider.instanceId === instanceId),
      isDefault: false,
    });
  }

  for (const driver of MCP_SUPPORTED_DRIVER_KINDS) {
    const defaultInstanceId = defaultInstanceIdForDriver(driver);
    const explicitInstance = settings.providerInstances?.[defaultInstanceId];
    const legacyConfig = settings.providers[driver as keyof typeof settings.providers];
    const instance =
      explicitInstance ??
      ({
        driver,
        enabled: legacyConfig.enabled,
        config: legacyConfig,
      } satisfies ProviderInstanceConfig);

    supportedRows.push({
      instanceId: defaultInstanceId,
      driver,
      instance,
      liveProvider: serverProviders.find((provider) => provider.instanceId === defaultInstanceId),
      isDefault: true,
    });
  }

  for (const row of customRowsById.values()) {
    if (supportedRows.some((supported) => supported.instanceId === row.instanceId)) {
      continue;
    }
    supportedRows.push(row);
  }

  return supportedRows.sort((left, right) => {
    const leftLabel = instanceLabelFromRow(left);
    const rightLabel = instanceLabelFromRow(right);
    return (
      leftLabel.localeCompare(rightLabel) ||
      String(left.instanceId).localeCompare(String(right.instanceId))
    );
  });
}

function createDraftFromServerArgs(input: {
  readonly name: string;
  readonly server: McpServerConfig;
  readonly selectedProviderIds: ReadonlySet<ProviderInstanceId>;
}): EditableMcpServerDraft {
  if (input.server.transport === "command") {
    return {
      name: input.name,
      transport: input.server.transport,
      command: input.server.command,
      argsText: input.server.args.join("\n"),
      url: "",
      env: cloneEntries(input.server.env),
      headers: [],
      selectedProviderIds: input.selectedProviderIds,
    };
  }

  return {
    name: input.name,
    transport: input.server.transport,
    command: "",
    argsText: "",
    url: input.server.url,
    env: [],
    headers: cloneEntries(input.server.headers),
    selectedProviderIds: input.selectedProviderIds,
  };
}

function createEmptyDraft(
  selectedProviderIds: ReadonlySet<ProviderInstanceId>,
): EditableMcpServerDraft {
  return {
    name: "",
    transport: "command",
    command: "",
    argsText: "",
    url: "",
    env: [
      {
        id: nextDraftEntryId("env"),
        key: "",
        value: "",
      },
    ],
    headers: [
      {
        id: nextDraftEntryId("header"),
        key: "",
        value: "",
      },
    ],
    selectedProviderIds,
  };
}

function buildServerConfigFromDraft(draft: EditableMcpServerDraft): McpServerConfig | null {
  const name = trimNonEmpty(draft.name);
  if (!name) return null;

  if (draft.transport === "command") {
    const command = trimNonEmpty(draft.command);
    if (!command) return null;
    return {
      transport: "command",
      command,
      args: splitLines(draft.argsText),
      env: parseDraftPairs(draft.env),
    };
  }

  const url = trimNonEmpty(draft.url);
  if (!url) return null;

  return {
    transport: draft.transport,
    url,
    headers: parseDraftPairs(draft.headers),
  };
}

function updateInstanceMcpServers(input: {
  readonly settings: UnifiedSettings;
  readonly row: SupportedProviderRow;
  readonly serverName: string;
  readonly nextServerName?: string;
  readonly nextServer: McpServerConfig | null;
  readonly updateSettings: (patch: Partial<UnifiedSettings>) => void;
}) {
  const nextConfig = { ...(input.row.instance.config as Record<string, unknown>) };
  const currentServers = { ...getConfigMcpServers(input.row.instance.config) };
  const finalServerName = input.nextServerName ?? input.serverName;

  delete currentServers[input.serverName];

  if (input.nextServer !== null) {
    currentServers[finalServerName] = input.nextServer;
  }

  nextConfig.mcpServers = currentServers;

  const nextInstance: ProviderInstanceConfig = {
    ...input.row.instance,
    config: nextConfig,
  };

  input.updateSettings(
    buildProviderInstanceUpdatePatch({
      settings: input.settings,
      instanceId: input.row.instanceId,
      instance: nextInstance,
      driver: input.row.driver,
      isDefault: input.row.isDefault,
    }),
  );
}

function McpServerDraftEditor(props: {
  readonly draft: EditableMcpServerDraft;
  readonly setDraft: (updater: (current: EditableMcpServerDraft) => EditableMcpServerDraft) => void;
}) {
  const { draft, setDraft } = props;

  const updateEntryList = (
    key: "env" | "headers",
    id: string,
    patch: Partial<McpEnvironmentEntry>,
  ) => {
    setDraft((current) => ({
      ...current,
      [key]: current[key].map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    }));
  };

  const addEntry = (key: "env" | "headers") => {
    setDraft((current) => ({
      ...current,
      [key]: [
        ...current[key],
        {
          id: nextDraftEntryId(key),
          key: "",
          value: "",
        },
      ],
    }));
  };

  const removeEntry = (key: "env" | "headers", id: string) => {
    setDraft((current) => ({
      ...current,
      [key]: current[key].filter((entry) => entry.id !== id),
    }));
  };

  const renderKeyValueEditor = (
    key: "env" | "headers",
    label: string,
    emptyDescription: string,
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => addEntry(key)}
        >
          <PlusIcon className="size-3" />
          Add
        </Button>
      </div>
      {draft[key].length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyDescription}</p>
      ) : (
        <div className="space-y-2">
          {draft[key].map((entry, index) => (
            <div key={entry.id} className="grid grid-cols-[1fr_1.25fr_auto] gap-2">
              <Input
                value={entry.key}
                placeholder={key === "env" ? "VARIABLE" : "Header"}
                onValueChange={(value) => updateEntryList(key, entry.id, { key: value })}
                aria-label={`${label} key ${index + 1}`}
              />
              <Input
                value={entry.value}
                placeholder="Value"
                onValueChange={(value) => updateEntryList(key, entry.id, { value })}
                aria-label={`${label} value ${index + 1}`}
              />
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Remove ${label} row`}
                onClick={() => removeEntry(key, entry.id)}
              >
                <Trash2Icon className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {draft.transport === "command" ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="mcp-command">
              Command
            </label>
            <Input
              id="mcp-command"
              value={draft.command}
              placeholder="npx"
              onValueChange={(value) => setDraft((current) => ({ ...current, command: value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="mcp-args">
              Arguments
            </label>
            <Textarea
              id="mcp-args"
              value={draft.argsText}
              placeholder="One argument per line"
              onChange={(event) =>
                setDraft((current) => ({ ...current, argsText: event.target.value }))
              }
            />
          </div>
          {renderKeyValueEditor(
            "env",
            "Environment variables",
            "Add environment variables to pass secrets or provider-specific settings.",
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="mcp-url">
              URL
            </label>
            <Input
              id="mcp-url"
              value={draft.url}
              placeholder="https://example.com/mcp"
              onValueChange={(value) => setDraft((current) => ({ ...current, url: value }))}
            />
          </div>
          {renderKeyValueEditor(
            "headers",
            "Headers",
            "Add request headers for SSE/HTTP transports.",
          )}
        </div>
      )}
    </>
  );
}

function McpServerWizardDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly draft: EditableMcpServerDraft;
  readonly setDraft: (updater: (current: EditableMcpServerDraft) => EditableMcpServerDraft) => void;
  readonly selectedEnvironmentLabel: string;
  readonly providerOptions: ReadonlyArray<{
    readonly id: ProviderInstanceId;
    readonly label: string;
  }>;
  readonly onSubmit: () => void;
}) {
  const {
    open,
    onOpenChange,
    draft,
    setDraft,
    selectedEnvironmentLabel,
    providerOptions,
    onSubmit,
  } = props;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) {
      setStep(0);
    }
  }, [open]);

  const canAdvance =
    step === 0
      ? trimNonEmpty(draft.name) !== null
      : step === 1
        ? draft.transport === "command"
          ? trimNonEmpty(draft.command) !== null
          : trimNonEmpty(draft.url) !== null
        : step === 2
          ? true
          : draft.selectedProviderIds.size > 0;

  const transportLabel = draft.transport === "command" ? "Command" : draft.transport.toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{step === 0 ? "Add MCP server" : "Edit MCP server"}</DialogTitle>
          <DialogDescription>
            Configure a server for {selectedEnvironmentLabel}. Step {step + 1} of 4.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-4">
          <div className="mb-4 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant={step >= 0 ? "secondary" : "outline"} size="sm">
              Name
            </Badge>
            <Badge variant={step >= 1 ? "secondary" : "outline"} size="sm">
              Transport
            </Badge>
            <Badge variant={step >= 2 ? "secondary" : "outline"} size="sm">
              Details
            </Badge>
            <Badge variant={step >= 3 ? "secondary" : "outline"} size="sm">
              Providers
            </Badge>
          </div>

          {step === 0 ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground" htmlFor="mcp-name">
                  Server name
                </label>
                <Input
                  id="mcp-name"
                  value={draft.name}
                  placeholder="github"
                  onValueChange={(value) => setDraft((current) => ({ ...current, name: value }))}
                />
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-foreground">Transport</span>
                <Select
                  value={draft.transport}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      transport: value as McpTransport,
                    }))
                  }
                >
                  <SelectTrigger className="w-full" aria-label="Transport">
                    <SelectValue>{transportLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup alignItemWithTrigger={false}>
                    <SelectItem hideIndicator value="command">
                      Command
                    </SelectItem>
                    <SelectItem hideIndicator value="http">
                      HTTP
                    </SelectItem>
                    <SelectItem hideIndicator value="sse">
                      SSE
                    </SelectItem>
                  </SelectPopup>
                </Select>
              </div>
            </div>
          ) : step === 1 ? (
            <McpServerDraftEditor draft={draft} setDraft={setDraft} />
          ) : step === 2 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Review the server details before choosing providers. This will be saved to the
                selected environment.
              </p>
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <div className="font-medium text-foreground">{draft.name.trim()}</div>
                <div className="mt-1 text-muted-foreground">{transportLabel}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {draft.transport === "command"
                    ? [draft.command, ...splitLines(draft.argsText)].join(" ")
                    : draft.url}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Install the server into one or more provider instances in {selectedEnvironmentLabel}
                .
              </p>
              <div className="space-y-2">
                {providerOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No compatible providers are available in this environment.
                  </p>
                ) : (
                  providerOptions.map((provider) => {
                    const checked = draft.selectedProviderIds.has(provider.id);
                    return (
                      <label
                        key={provider.id}
                        className="flex items-center gap-3 rounded-lg border px-3 py-2"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(nextChecked) => {
                            const nextSelected = new Set(draft.selectedProviderIds);
                            if (nextChecked === true) nextSelected.add(provider.id);
                            else nextSelected.delete(provider.id);
                            setDraft((current) => ({
                              ...current,
                              selectedProviderIds: nextSelected,
                            }));
                          }}
                        />
                        <span className="text-sm font-medium text-foreground">
                          {provider.label}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
          >
            Back
          </Button>
          {step < 3 ? (
            <Button
              disabled={!canAdvance}
              onClick={() => setStep((current) => Math.min(3, current + 1))}
            >
              Next
            </Button>
          ) : (
            <Button
              disabled={!canAdvance}
              onClick={() => {
                onSubmit();
                onOpenChange(false);
              }}
            >
              Save MCP server
            </Button>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function McpServersSettingsSectionContent(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const { environments } = useEnvironments();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId>(environmentId);

  useEffect(() => {
    setSelectedEnvironmentId(environmentId);
  }, [environmentId]);

  useEffect(() => {
    if (environments.some((candidate) => candidate.environmentId === selectedEnvironmentId)) {
      return;
    }

    const nextEnvironmentId = environments[0]?.environmentId ?? environmentId;
    setSelectedEnvironmentId(nextEnvironmentId);
  }, [environmentId, environments, selectedEnvironmentId]);

  const environment = useEnvironment(selectedEnvironmentId);
  const settings = useEnvironmentSettings(selectedEnvironmentId);
  const updateSettings = useUpdateEnvironmentSettings(selectedEnvironmentId);
  const serverProviders = useAtomValue(serverEnvironment.providersValueAtom(selectedEnvironmentId));

  const providerRows = useMemo(
    () => buildSupportedProviderRows({ settings, serverProviders }),
    [serverProviders, settings],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServerName, setEditingServerName] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableMcpServerDraft>(() => createEmptyDraft(new Set()));

  const providerOptions = useMemo(
    () =>
      providerRows.map((row) => ({
        id: row.instanceId,
        label: instanceLabelFromRow(row),
      })),
    [providerRows],
  );

  const openCreateDialog = useCallback(() => {
    const defaultSelected = new Set(providerRows.map((row) => row.instanceId));
    setEditingServerName(null);
    setDraft(createEmptyDraft(defaultSelected));
    setDialogOpen(true);
  }, [providerRows]);

  const openEditDialog = useCallback(
    (row: SupportedProviderRow, serverName: string, server: McpServerConfig) => {
      setEditingServerName(serverName);
      setDraft(
        createDraftFromServerArgs({
          name: serverName,
          server,
          selectedProviderIds: new Set([row.instanceId]),
        }),
      );
      setDialogOpen(true);
    },
    [],
  );

  const saveDraft = useCallback(() => {
    const server = buildServerConfigFromDraft(draft);
    if (!server) {
      return;
    }
    const serverName = trimNonEmpty(draft.name);
    if (!serverName) {
      return;
    }

    for (const row of providerRows) {
      const currentServers = getConfigMcpServers(row.instance.config);
      const shouldInstall = draft.selectedProviderIds.has(row.instanceId);
      const previousServerName = editingServerName ?? serverName;
      const hasExistingPrevious = Object.prototype.hasOwnProperty.call(
        currentServers,
        previousServerName,
      );

      if (!shouldInstall && !hasExistingPrevious) {
        continue;
      }

      updateInstanceMcpServers({
        settings,
        row,
        serverName: previousServerName,
        nextServerName: serverName,
        nextServer: shouldInstall ? server : null,
        updateSettings,
      });
    }
  }, [draft, editingServerName, providerRows, settings, updateSettings]);

  return (
    <SettingsSection
      title="MCP servers"
      headerAction={
        <div className="flex items-center gap-2">
          <Select
            value={String(selectedEnvironmentId)}
            onValueChange={(value) => {
              if (value === null) return;
              setSelectedEnvironmentId(EnvironmentId.make(value));
            }}
          >
            <SelectTrigger className="min-w-44" aria-label="Environment">
              <SelectValue>{environment?.label ?? "Environment"}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {environments.map((candidate) => (
                <SelectItem
                  key={candidate.environmentId}
                  hideIndicator
                  value={String(candidate.environmentId)}
                >
                  {candidate.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-5 rounded-sm p-0 text-muted-foreground hover:text-foreground"
            onClick={openCreateDialog}
            aria-label="Add MCP server"
          >
            <PlusIcon className="size-3" />
          </Button>
        </div>
      }
    >
      <div className="space-y-0">
        {providerRows.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">
            No Codex or Claude provider instances are available in this environment.
          </div>
        ) : (
          providerRows.map((row, index) => {
            const providerName = row.liveProvider
              ? instanceLabel(row.liveProvider)
              : (PROVIDER_DISPLAY_NAMES[row.driver] ?? row.driver);
            const mcpServers = getConfigMcpServers(row.instance.config);
            const serverEntries = Object.entries(mcpServers);

            return (
              <div
                key={row.instanceId}
                className={index > 0 ? "border-t border-border/60" : undefined}
              >
                <div className="px-4 pt-3.5 pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{providerName}</h3>
                        {row.isDefault ? (
                          <Badge variant="outline" size="sm">
                            Default
                          </Badge>
                        ) : (
                          <Badge variant="secondary" size="sm">
                            Custom
                          </Badge>
                        )}
                        {row.liveProvider?.installed ? (
                          <Badge variant="success" size="sm">
                            Installed
                          </Badge>
                        ) : (
                          <Badge variant="warning" size="sm">
                            Unavailable
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {serverEntries.length === 0
                          ? "No MCP servers configured."
                          : `${serverEntries.length} MCP server${serverEntries.length === 1 ? "" : "s"} configured.`}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 px-4 pb-3.5">
                  {serverEntries.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground">
                      Add a server with the button above.
                    </div>
                  ) : (
                    serverEntries.map(([serverName, server]) => (
                      <SettingsRow
                        key={serverName}
                        title={serverName}
                        description={getMcpServerSubtitle(server)}
                        status={getMcpServerSummary(server)}
                        control={
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              className="size-5 rounded-sm p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => openEditDialog(row, serverName, server)}
                              aria-label={`Edit ${serverName}`}
                            >
                              <PencilIcon className="size-3" />
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              className="size-5 rounded-sm p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                updateInstanceMcpServers({
                                  settings,
                                  row,
                                  serverName,
                                  nextServer: null,
                                  updateSettings,
                                });
                              }}
                              aria-label={`Remove ${serverName}`}
                            >
                              <Trash2Icon className="size-3" />
                            </Button>
                          </div>
                        }
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <McpServerWizardDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        draft={draft}
        setDraft={setDraft}
        selectedEnvironmentLabel={environment?.label ?? "this environment"}
        providerOptions={providerOptions}
        onSubmit={saveDraft}
      />
    </SettingsSection>
  );
}

export function McpServersSettingsSection() {
  const { environments } = useEnvironments();
  const primaryEnvironment = usePrimaryEnvironment();
  const initialEnvironmentId =
    primaryEnvironment?.environmentId ?? environments[0]?.environmentId ?? null;

  if (!initialEnvironmentId) {
    return null;
  }

  return <McpServersSettingsSectionContent environmentId={initialEnvironmentId} />;
}
