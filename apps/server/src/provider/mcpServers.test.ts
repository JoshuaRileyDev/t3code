import { assert, describe, it } from "@effect/vitest";

import { buildClaudeMcpServers, buildCodexAppServerArgs } from "./mcpServers.ts";

describe("provider MCP config helpers", () => {
  it("maps normalized MCP servers into Claude SDK config", () => {
    const servers = buildClaudeMcpServers({
      docs: {
        transport: "http",
        url: "https://developers.openai.com/mcp",
        headers: { Authorization: "Bearer token" },
      },
      files: {
        transport: "command",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
        env: { HOME: "/tmp" },
      },
    });

    assert.deepStrictEqual(servers, {
      docs: {
        type: "http",
        url: "https://developers.openai.com/mcp",
        headers: { Authorization: "Bearer token" },
      },
      files: {
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
        env: { HOME: "/tmp" },
      },
    });
  });

  it("serializes normalized MCP servers into Codex config overrides", () => {
    const args = buildCodexAppServerArgs({
      docs: {
        transport: "sse",
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer token" },
      },
    });

    assert.deepStrictEqual(args, [
      "-c",
      'mcp_servers.docs.type="sse"',
      "-c",
      'mcp_servers.docs.url="https://example.com/mcp"',
      "-c",
      'mcp_servers.docs.headers={ Authorization = "Bearer token" }',
    ]);
  });
});
