import { createFileRoute } from "@tanstack/react-router";

import { McpServersSettingsSection } from "../components/settings/McpServersSettings";

function SettingsMcpRoute() {
  return <McpServersSettingsSection />;
}

export const Route = createFileRoute("/settings/mcp" as never)({
  component: SettingsMcpRoute,
});
