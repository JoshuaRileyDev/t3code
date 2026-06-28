import type { Options as ClaudeQueryOptions } from "@anthropic-ai/claude-agent-sdk";

import type { McpServerConfig, McpServerConfigMap } from "@t3tools/contracts";

function formatTomlInlineValue(value: string | number | boolean): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatTomlInlineArray(values: ReadonlyArray<string>): string {
  return `[${values.map((value) => formatTomlInlineValue(value)).join(", ")}]`;
}

function formatTomlInlineTable(values: Readonly<Record<string, string>>): string {
  const entries = Object.entries(values).map(
    ([key, value]) => `${key} = ${formatTomlInlineValue(value)}`,
  );
  return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
}

type ClaudeMcpServer = NonNullable<ClaudeQueryOptions["mcpServers"]>[string];

function buildClaudeMcpServer(server: McpServerConfig): ClaudeMcpServer {
  if (server.transport === "command") {
    return {
      type: "stdio",
      command: server.command,
      args: [...server.args],
      env: { ...server.env },
    };
  }

  return {
    type: server.transport,
    url: server.url,
    headers: { ...server.headers },
  };
}

export function buildClaudeMcpServers(
  config: McpServerConfigMap | undefined,
): ClaudeQueryOptions["mcpServers"] | undefined {
  if (!config || Object.keys(config).length === 0) {
    return undefined;
  }

  const next: NonNullable<ClaudeQueryOptions["mcpServers"]> = {};
  for (const [name, server] of Object.entries(config)) {
    next[name] = buildClaudeMcpServer(server);
  }
  return next;
}

function buildCodexServerOverride(name: string, server: McpServerConfig): Array<string> {
  const prefix = `mcp_servers.${name}`;
  if (server.transport === "command") {
    return [
      "-c",
      `${prefix}.command=${formatTomlInlineValue(server.command)}`,
      "-c",
      `${prefix}.args=${formatTomlInlineArray(server.args)}`,
      "-c",
      `${prefix}.env=${formatTomlInlineTable(server.env)}`,
    ];
  }

  return [
    "-c",
    `${prefix}.type=${formatTomlInlineValue(server.transport)}`,
    "-c",
    `${prefix}.url=${formatTomlInlineValue(server.url)}`,
    "-c",
    `${prefix}.headers=${formatTomlInlineTable(server.headers)}`,
  ];
}

export function buildCodexAppServerArgs(config: McpServerConfigMap | undefined): Array<string> {
  if (!config || Object.keys(config).length === 0) {
    return [];
  }

  const args: Array<string> = [];
  for (const [name, server] of Object.entries(config)) {
    args.push(...buildCodexServerOverride(name, server));
  }
  return args;
}
