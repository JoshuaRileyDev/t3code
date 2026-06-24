import { describe, expect, it } from "vite-plus/test";

import { EnvironmentId } from "@t3tools/contracts";

import {
  integrationAccountScopeSummary,
  integrationAccountTargetEnvironmentIds,
} from "./integrations.ts";

describe("integration scope helpers", () => {
  it("keeps the current environment when no scope is set", () => {
    expect(
      integrationAccountTargetEnvironmentIds({
        currentEnvironmentId: EnvironmentId.make("env-current"),
        allEnvironmentIds: [EnvironmentId.make("env-current"), EnvironmentId.make("env-other")],
        scope: undefined,
      }),
    ).toEqual([EnvironmentId.make("env-current")]);
  });

  it("expands selected scopes across connected environments", () => {
    expect(
      integrationAccountTargetEnvironmentIds({
        currentEnvironmentId: EnvironmentId.make("env-current"),
        allEnvironmentIds: [
          EnvironmentId.make("env-current"),
          EnvironmentId.make("env-one"),
          EnvironmentId.make("env-two"),
        ],
        scope: {
          kind: "selected",
          environmentIds: [EnvironmentId.make("env-two")],
        },
      }),
    ).toEqual([EnvironmentId.make("env-current"), EnvironmentId.make("env-two")]);
  });

  it("summarizes all-environment visibility", () => {
    expect(
      integrationAccountScopeSummary({
        scope: { kind: "all" },
        currentEnvironmentLabel: "Primary",
        environmentLabelById: new Map(),
      }),
    ).toBe("Available in all environments");
  });
});
