import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString, TrimmedString } from "./baseSchemas.ts";

const McpTransport = Schema.Literals(["command", "http", "sse"]);
export type McpTransport = typeof McpTransport.Type;

export const McpServerEnvironmentVariables = Schema.Record(
  TrimmedNonEmptyString,
  TrimmedString,
).pipe(Schema.withDecodingDefault(Effect.succeed({})));
export type McpServerEnvironmentVariables = typeof McpServerEnvironmentVariables.Type;

export const McpServerHeaders = Schema.Record(TrimmedNonEmptyString, TrimmedString).pipe(
  Schema.withDecodingDefault(Effect.succeed({})),
);
export type McpServerHeaders = typeof McpServerHeaders.Type;

export const McpServerCommandConfig = Schema.Struct({
  transport: Schema.Literal("command"),
  command: TrimmedNonEmptyString,
  args: Schema.Array(TrimmedString).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  env: McpServerEnvironmentVariables,
});
export type McpServerCommandConfig = typeof McpServerCommandConfig.Type;

export const McpServerRemoteConfig = Schema.Struct({
  transport: Schema.Union([Schema.Literal("http"), Schema.Literal("sse")]),
  url: TrimmedNonEmptyString,
  headers: McpServerHeaders,
});
export type McpServerRemoteConfig = typeof McpServerRemoteConfig.Type;

export const McpServerConfig = Schema.Union([McpServerCommandConfig, McpServerRemoteConfig]);
export type McpServerConfig = typeof McpServerConfig.Type;

export const McpServerConfigMap = Schema.Record(TrimmedNonEmptyString, McpServerConfig);
export type McpServerConfigMap = typeof McpServerConfigMap.Type;
