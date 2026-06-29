// @effect-diagnostics nodeBuiltinImport:off
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import {
  INTEGRATION_DISPLAY_NAMES,
  IntegrationAccountTokenValidationError,
  type IntegrationAccountTokenValidationInput,
  type IntegrationAccountTokenValidationResult,
  type SourceControlRepositoryInfo,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";

export function appendServerLogLine(
  logPath: string | undefined,
  message: string,
  annotations?: Record<string, unknown>,
) {
  if (!logPath) {
    return Effect.void;
  }

  return Effect.sync(() => {
    NodeFS.mkdirSync(NodePath.dirname(logPath), { recursive: true });
    NodeFS.appendFileSync(
      logPath,
      `${message}${annotations && Object.keys(annotations).length > 0 ? ` ${JSON.stringify(annotations)}` : ""}\n`,
    );
  }).pipe(Effect.ignore);
}

const GitHubUserResponse = Schema.Struct({
  login: TrimmedNonEmptyString,
  name: Schema.NullOr(TrimmedNonEmptyString),
});

const GitHubRepositoryResponse = Schema.Struct({
  name_with_owner: TrimmedNonEmptyString,
  html_url: TrimmedNonEmptyString,
  ssh_url: TrimmedNonEmptyString,
  archived: Schema.Boolean,
  private: Schema.Boolean,
});

const GitLabUserResponse = Schema.Struct({
  name: Schema.NullOr(TrimmedNonEmptyString),
  username: TrimmedNonEmptyString,
});

const JiraCurrentUserResponse = Schema.Struct({
  displayName: TrimmedNonEmptyString,
  emailAddress: Schema.NullOr(TrimmedNonEmptyString),
});

const LinearGraphQLError = Schema.Struct({
  message: TrimmedNonEmptyString,
});

const LinearViewerResponse = Schema.Struct({
  data: Schema.Struct({
    viewer: Schema.NullOr(
      Schema.Struct({
        name: Schema.NullOr(TrimmedNonEmptyString),
        email: Schema.NullOr(TrimmedNonEmptyString),
      }),
    ),
  }),
  errors: Schema.optional(Schema.Array(LinearGraphQLError)),
});

function validationError(
  input: IntegrationAccountTokenValidationInput,
  detail: string,
  cause?: unknown,
) {
  return new IntegrationAccountTokenValidationError({
    kind: input.kind,
    detail,
    ...(cause === undefined ? {} : { cause }),
  });
}

function makeUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

function normalizeGitHubRepository(input: {
  name_with_owner: string;
  html_url: string;
  ssh_url: string;
}): SourceControlRepositoryInfo {
  return {
    provider: "github",
    nameWithOwner: input.name_with_owner,
    url: input.html_url,
    sshUrl: input.ssh_url,
  };
}

type IntegrationValidator = (
  input: IntegrationAccountTokenValidationInput,
  httpClient: HttpClient.HttpClient,
) => Effect.Effect<IntegrationAccountTokenValidationResult, IntegrationAccountTokenValidationError>;

const INTEGRATION_VALIDATORS: Record<
  IntegrationAccountTokenValidationInput["kind"],
  IntegrationValidator
> = {
  github: (input, httpClient) => {
    const request = HttpClientRequest.get("https://api.github.com/user").pipe(
      HttpClientRequest.bearerToken(input.apiKey!),
      HttpClientRequest.acceptJson,
      HttpClientRequest.setHeader("user-agent", "t3-code"),
      HttpClientRequest.setHeader("x-github-api-version", "2022-11-28"),
    );

    return httpClient.execute(request).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(GitHubUserResponse)),
      Effect.mapError((cause) =>
        validationError(
          input,
          `Could not verify the ${INTEGRATION_DISPLAY_NAMES[input.kind]} token.`,
          cause,
        ),
      ),
      Effect.map((response) => ({
        accountLabel: response.name ?? response.login,
      })),
    );
  },
  gitlab: (input, httpClient) => {
    const baseUrl = input.baseUrl ?? "https://gitlab.com";
    const request = HttpClientRequest.get(makeUrl(baseUrl, "/api/v4/user")).pipe(
      HttpClientRequest.setHeader("private-token", input.apiKey!),
      HttpClientRequest.acceptJson,
    );

    return httpClient.execute(request).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(GitLabUserResponse)),
      Effect.mapError((cause) =>
        validationError(
          input,
          `Could not verify the ${INTEGRATION_DISPLAY_NAMES[input.kind]} token.`,
          cause,
        ),
      ),
      Effect.map((response) => ({
        accountLabel: response.name ?? response.username,
      })),
    );
  },
  jira: (input, httpClient) => {
    if (input.baseUrl === undefined || input.baseUrl.length === 0) {
      return Effect.fail(
        validationError(input, "Jira requires a base URL before testing the token."),
      );
    }

    if (input.accountName === undefined || input.accountName.length === 0) {
      return Effect.fail(
        validationError(input, "Jira requires an account name before testing the token."),
      );
    }

    const request = HttpClientRequest.get(makeUrl(input.baseUrl, "/rest/api/3/myself")).pipe(
      HttpClientRequest.basicAuth(input.accountName, input.apiKey!),
      HttpClientRequest.acceptJson,
    );

    return httpClient.execute(request).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(JiraCurrentUserResponse)),
      Effect.mapError((cause) =>
        validationError(
          input,
          `Could not verify the ${INTEGRATION_DISPLAY_NAMES[input.kind]} token.`,
          cause,
        ),
      ),
      Effect.map((response) => ({
        accountLabel: response.displayName,
      })),
    );
  },
  linear: (input, httpClient) => {
    const request = HttpClientRequest.post("https://api.linear.app/graphql").pipe(
      HttpClientRequest.bearerToken(input.apiKey!),
      HttpClientRequest.acceptJson,
      HttpClientRequest.bodyJsonUnsafe({
        query: "query Me { viewer { name email } }",
      }),
    );

    return httpClient.execute(request).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(LinearViewerResponse)),
      Effect.mapError((cause) =>
        validationError(
          input,
          `Could not verify the ${INTEGRATION_DISPLAY_NAMES[input.kind]} token.`,
          cause,
        ),
      ),
      Effect.flatMap((response) => {
        if ((response.errors?.length ?? 0) > 0) {
          return Effect.fail(
            validationError(
              input,
              response.errors?.[0]?.message ?? "Linear API returned an error.",
            ),
          );
        }
        return Effect.succeed({
          accountLabel:
            response.data.viewer?.name ?? response.data.viewer?.email ?? "Linear account",
        });
      }),
    );
  },
};

export const testIntegrationToken = (
  input: IntegrationAccountTokenValidationInput,
): Effect.Effect<
  IntegrationAccountTokenValidationResult,
  IntegrationAccountTokenValidationError,
  HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    if (input.apiKey === undefined) {
      return yield* Effect.fail(
        validationError(input, "An API key is required to test the token."),
      );
    }
    const httpClient = yield* HttpClient.HttpClient;
    return yield* INTEGRATION_VALIDATORS[input.kind](input, httpClient);
  });

export const listIntegrationRepositories = (
  input: IntegrationAccountTokenValidationInput,
  serverLogPath?: string,
): Effect.Effect<
  ReadonlyArray<SourceControlRepositoryInfo>,
  IntegrationAccountTokenValidationError,
  HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const writeLogLine = (message: string, annotations?: Record<string, unknown>) =>
      appendServerLogLine(serverLogPath, message, annotations);

    yield* writeLogLine("integration repository lookup started", {
      integrationKind: input.kind,
      accountId: input.accountId ?? null,
      hasApiKey: input.apiKey !== undefined,
      baseUrl: input.baseUrl ?? null,
    });
    yield* Effect.logInfo("integration repository lookup started", {
      integrationKind: input.kind,
      accountId: input.accountId ?? null,
      hasApiKey: input.apiKey !== undefined,
      baseUrl: input.baseUrl ?? null,
    });
    if (input.kind !== "github") {
      yield* Effect.logInfo("integration repository lookup skipped; unsupported integration", {
        integrationKind: input.kind,
      });
      return [];
    }
    if (input.apiKey === undefined) {
      return yield* Effect.fail(
        validationError(input, "An API key is required to list repositories."),
      );
    }
    const httpClient = yield* HttpClient.HttpClient;
    const perPage = 100;
    const repositories: SourceControlRepositoryInfo[] = [];
    for (let page = 1; page <= 10; page += 1) {
      yield* Effect.logInfo("integration repository lookup requesting page", {
        integrationKind: input.kind,
        accountId: input.accountId ?? null,
        page,
        perPage,
      });
      yield* writeLogLine("integration repository lookup requesting page", {
        integrationKind: input.kind,
        accountId: input.accountId ?? null,
        page,
        perPage,
      });
      const request = HttpClientRequest.get(
        `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&affiliation=owner,collaborator,organization_member&sort=full_name&direction=asc`,
      ).pipe(
        HttpClientRequest.bearerToken(input.apiKey),
        HttpClientRequest.acceptJson,
        HttpClientRequest.setHeader("user-agent", "t3-code"),
        HttpClientRequest.setHeader("x-github-api-version", "2022-11-28"),
      );
      const response = yield* httpClient.execute(request).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(GitHubRepositoryResponse))),
        Effect.mapError((cause) =>
          validationError(
            input,
            `Could not list repositories for the ${INTEGRATION_DISPLAY_NAMES[input.kind]} token.`,
            cause,
          ),
        ),
      );
      repositories.push(...response.map(normalizeGitHubRepository));
      yield* Effect.logInfo("integration repository lookup page received", {
        integrationKind: input.kind,
        accountId: input.accountId ?? null,
        page,
        received: response.length,
        totalSoFar: repositories.length,
      });
      yield* writeLogLine("integration repository lookup page received", {
        integrationKind: input.kind,
        accountId: input.accountId ?? null,
        page,
        received: response.length,
        totalSoFar: repositories.length,
      });
      if (response.length < perPage) {
        break;
      }
    }
    yield* Effect.logInfo("integration repository lookup completed", {
      integrationKind: input.kind,
      accountId: input.accountId ?? null,
      totalRepositories: repositories.length,
    });
    yield* writeLogLine("integration repository lookup completed", {
      integrationKind: input.kind,
      accountId: input.accountId ?? null,
      totalRepositories: repositories.length,
    });
    return repositories;
  });
