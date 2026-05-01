import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { ensureLocalApi } from "../localApi";
import { selectProjectsAcrossEnvironments, useStore } from "../store";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { toastManager } from "../components/ui/toast";

function statusLabel(status: string) {
  if (status === "status_updated") return "In Review";
  if (status === "pr_created") return "PR Created";
  if (status === "completed_without_signal") return "No Signal";
  return status.replace(/_/g, " ");
}

function LinearIssuesPage() {
  const localApi = ensureLocalApi();
  const projects = useStore(useShallow(selectProjectsAcrossEnvironments));
  const [issues, setIssues] = useState<
    Awaited<ReturnType<ReturnType<typeof ensureLocalApi>["server"]["listLinearIssues"]>>["issues"]
  >([]);
  const [runs, setRuns] = useState<
    Awaited<ReturnType<ReturnType<typeof ensureLocalApi>["server"]["listLinearIssueRuns"]>>["jobs"]
  >([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [issuesResult, runsResult] = await Promise.all([
        localApi.server.listLinearIssues({}),
        localApi.server.listLinearIssueRuns({}),
      ]);
      setIssues(issuesResult.issues);
      setRuns(runsResult.jobs);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to load Linear issues",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 8_000);
    return () => clearInterval(interval);
  }, []);

  const latestRunByIssueId = useMemo(() => {
    const map = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      const existing = map.get(run.issueId);
      if (!existing || existing.updatedAt < run.updatedAt) {
        map.set(run.issueId, run);
      }
    }
    return map;
  }, [runs]);

  const issuesByState = useMemo(() => {
    const grouped = new Map<string, Array<(typeof issues)[number]>>();
    for (const issue of issues) {
      const key = issue.stateName;
      const list = grouped.get(key);
      if (list) {
        list.push(issue);
      } else {
        grouped.set(key, [issue]);
      }
    }
    return Array.from(grouped.entries()).sort((left, right) => left[0].localeCompare(right[0]));
  }, [issues]);

  const runIssueInBackground = async (issue: (typeof issues)[number]) => {
    const matchingProject =
      projects.find((project) => project.name === issue.projectName) ?? projects[0];
    if (!matchingProject) {
      toastManager.add({
        type: "error",
        title: "No app project available",
        description: "Add a project and map it in settings before running Linear issues.",
      });
      return;
    }

    const runAccountId = runs.find((run) => run.issueId === issue.id)?.accountId;
    const fallbackAccountId = runAccountId ?? (await localApi.server.listLinearAccounts())[0]?.id;
    if (!fallbackAccountId) {
      toastManager.add({ type: "error", title: "No Linear account configured" });
      return;
    }

    await localApi.server.startLinearIssueRun({
      accountId: fallbackAccountId,
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      issueTitle: issue.title,
      issueUrl: issue.url,
      environmentId: matchingProject.environmentId,
      projectId: matchingProject.id,
    });

    await refresh();
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        <header className="border-b border-border px-3 py-2 sm:px-5">
          <div className="flex min-h-7 items-center gap-2 sm:min-h-6">
            <SidebarTrigger className="size-7 shrink-0 md:hidden" />
            <span className="text-sm font-medium text-foreground">Linear Issues</span>
            <Button
              size="xs"
              variant="outline"
              className="ms-auto"
              disabled={loading}
              onClick={() => void refresh()}
            >
              Refresh
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="grid min-h-full grid-flow-col auto-cols-[320px] gap-4 overflow-x-auto pb-2">
            {issuesByState.map(([stateName, stateIssues]) => (
              <section
                key={stateName}
                className="flex h-full min-h-[300px] flex-col rounded-xl border bg-card"
              >
                <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {stateName}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {stateIssues.map((issue) => {
                    const run = latestRunByIssueId.get(issue.id);
                    return (
                      <article key={issue.id} className="rounded-lg border bg-background p-3">
                        <div className="mb-2 text-xs text-muted-foreground">{issue.identifier}</div>
                        <div className="text-sm font-medium">{issue.title}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {run ? <Badge variant="outline">{statusLabel(run.status)}</Badge> : null}
                          {run?.prUrl ? (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => void localApi.shell.openExternal(run.prUrl!)}
                            >
                              Open PR
                            </Button>
                          ) : null}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <Button size="xs" onClick={() => void runIssueInBackground(issue)}>
                            Run In Background
                          </Button>
                          {run?.status === "failed" ? (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => void runIssueInBackground(issue)}
                            >
                              Retry
                            </Button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/linear-issues")({
  beforeLoad: async ({ context }) => {
    if (context.authGateState.status !== "authenticated") {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: LinearIssuesPage,
});
