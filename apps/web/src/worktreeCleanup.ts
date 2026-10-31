import { normalizeProjectPathForComparison } from "@t3tools/shared/path";

import type { ThreadShell } from "./types";

export function getOrphanedWorktreePathForThread(
  threads: ReadonlyArray<Pick<ThreadShell, "id" | "worktreePath">>,
  threadId: ThreadShell["id"],
): string | null {
  const targetThread = threads.find((thread) => thread.id === threadId);
  if (!targetThread) {
    return null;
  }

  const targetWorktreePath = targetThread.worktreePath?.trim();
  if (!targetWorktreePath) {
    return null;
  }

  // Threads can store one worktree as `/repo/wt` and `/repo/wt/`, and
  // confirming deletion force-removes the checkout for every thread on it.
  const targetKey = normalizeProjectPathForComparison(targetWorktreePath);
  const isShared = threads.some(
    (thread) =>
      thread.id !== threadId &&
      thread.worktreePath !== null &&
      normalizeProjectPathForComparison(thread.worktreePath) === targetKey,
  );

  return isShared ? null : targetWorktreePath;
}

export function getOrphanedBranchNameForThread(
  threads: ReadonlyArray<Pick<ThreadShell, "id" | "branch">>,
  threadId: ThreadShell["id"],
): string | null {
  const targetThread = threads.find((thread) => thread.id === threadId);
  if (!targetThread) {
    return null;
  }

  const targetBranch = normalizeWorktreePath(targetThread.branch);
  if (!targetBranch) {
    return null;
  }

  const isShared = threads.some((thread) => {
    if (thread.id === threadId) {
      return false;
    }
    return normalizeWorktreePath(thread.branch) === targetBranch;
  });

  return isShared ? null : targetBranch;
}

export function formatWorktreePathForDisplay(worktreePath: string): string {
  const trimmed = worktreePath.trim();
  if (!trimmed) {
    return worktreePath;
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/");
  const lastPart = parts[parts.length - 1]?.trim() ?? "";
  return lastPart.length > 0 ? lastPart : trimmed;
}
