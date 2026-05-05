import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import type { AutomationIssue, ProjectId } from "@t3tools/contracts";

const COLUMNS = ["backlog", "queued", "running", "failed", "done"] as const;

export function AutomationBoard(props: {
  issues: ReadonlyArray<AutomationIssue>;
  environmentId: string;
  projectId?: ProjectId | null;
  onEnqueue: (issueId: string) => Promise<void>;
  onRetry: (issueId: string) => Promise<void>;
  onCancel: (issueId: string) => Promise<void>;
}) {
  const filtered = useMemo(
    () =>
      props.projectId
        ? props.issues.filter((issue) => issue.projectId === props.projectId)
        : props.issues,
    [props.issues, props.projectId],
  );

  return (
    <div className="grid gap-4 md:grid-cols-5">
      {COLUMNS.map((column) => (
        <section key={column} className="rounded-md border bg-card p-3">
          <h3 className="mb-3 text-sm font-semibold capitalize">{column}</h3>
          <div className="space-y-3">
            {filtered
              .filter((issue) => issue.status === column)
              .map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  environmentId={props.environmentId}
                  onEnqueue={props.onEnqueue}
                  onRetry={props.onRetry}
                  onCancel={props.onCancel}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function IssueCard(props: {
  issue: AutomationIssue;
  environmentId: string;
  onEnqueue: (issueId: string) => Promise<void>;
  onRetry: (issueId: string) => Promise<void>;
  onCancel: (issueId: string) => Promise<void>;
}) {
  const { issue } = props;

  return (
    <article className="rounded border bg-background p-3">
      <h4 className="text-sm font-medium">{issue.title}</h4>
      <p className="mt-1 line-clamp-4 text-xs text-muted-foreground">{issue.description}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {issue.latestThreadId ? (
          <Link
            className="text-primary underline"
            to="/$environmentId/$threadId"
            params={{ environmentId: props.environmentId, threadId: issue.latestThreadId }}
          >
            Thread
          </Link>
        ) : null}
        {issue.latestPullRequestUrl ? (
          <a
            className="text-primary underline"
            href={issue.latestPullRequestUrl}
            rel="noreferrer"
            target="_blank"
          >
            PR
          </a>
        ) : null}
      </div>
      <div className="mt-3 flex gap-2">
        {issue.status === "backlog" || issue.status === "paused" ? (
          <button
            className="rounded border px-2 py-1 text-xs"
            onClick={() => void props.onEnqueue(issue.id)}
            type="button"
          >
            Queue
          </button>
        ) : null}
        {issue.status === "failed" ? (
          <button
            className="rounded border px-2 py-1 text-xs"
            onClick={() => void props.onRetry(issue.id)}
            type="button"
          >
            Retry
          </button>
        ) : null}
        {issue.status === "queued" || issue.status === "running" ? (
          <button
            className="rounded border px-2 py-1 text-xs"
            onClick={() => void props.onCancel(issue.id)}
            type="button"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </article>
  );
}
