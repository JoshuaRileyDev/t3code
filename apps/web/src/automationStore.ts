import type {
  AutomationBoardEvent,
  AutomationBoardSnapshot,
  AutomationIssue,
  AutomationQueueConfig,
  EnvironmentId,
} from "@t3tools/contracts";
import { create } from "zustand";

interface AutomationState {
  environmentId: EnvironmentId | null;
  issues: ReadonlyArray<AutomationIssue>;
  queueConfig: AutomationQueueConfig | null;
  lastUpdatedAt: string | null;
  setEnvironmentId: (environmentId: EnvironmentId | null) => void;
  applySnapshot: (snapshot: AutomationBoardSnapshot) => void;
  applyEvent: (event: AutomationBoardEvent) => void;
}

function upsertIssue(
  issues: ReadonlyArray<AutomationIssue>,
  issue: AutomationIssue,
): ReadonlyArray<AutomationIssue> {
  const index = issues.findIndex((candidate) => candidate.id === issue.id);
  if (index === -1) {
    return [issue, ...issues];
  }
  const next = issues.slice();
  next[index] = issue;
  return next;
}

export const useAutomationStore = create<AutomationState>((set) => ({
  environmentId: null,
  issues: [],
  queueConfig: null,
  lastUpdatedAt: null,
  setEnvironmentId: (environmentId) => set({ environmentId }),
  applySnapshot: (snapshot) =>
    set({
      issues: [...snapshot.issues],
      queueConfig: snapshot.queueConfig,
      lastUpdatedAt: new Date().toISOString(),
    }),
  applyEvent: (event) =>
    set((state) => {
      switch (event.kind) {
        case "snapshot":
          return {
            issues: [...event.snapshot.issues],
            queueConfig: event.snapshot.queueConfig,
            lastUpdatedAt: new Date().toISOString(),
          };
        case "issue-upserted":
          return {
            issues: upsertIssue(state.issues, event.issue),
            lastUpdatedAt: new Date().toISOString(),
          };
        case "issue-removed":
          return {
            issues: state.issues.filter((issue) => issue.id !== event.issueId),
            lastUpdatedAt: new Date().toISOString(),
          };
        case "queue-config-updated":
          return {
            queueConfig: event.queueConfig,
            lastUpdatedAt: new Date().toISOString(),
          };
        case "run-upserted":
          return {
            lastUpdatedAt: new Date().toISOString(),
          };
        default:
          return state;
      }
    }),
}));
