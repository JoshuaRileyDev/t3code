import * as Schema from "effect/Schema";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { randomUUID } from "./lib/utils";

export const automationWeekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type AutomationWeekday = (typeof automationWeekdays)[number];
export type AutomationFrequency = "daily" | "weekly" | "monthly" | "multiple-weekly" | "interval";
export type AutomationIntervalUnit = "minute" | "hour" | "day";
export type AutomationWorkspaceMode = "new-worktree" | "main-branch";

export interface ProjectAutomationExecution {
  archiveThread: boolean;
  workspaceMode: AutomationWorkspaceMode;
  branchName?: string | undefined;
}

export interface ProjectAutomationSchedule {
  frequency: AutomationFrequency;
  days: readonly AutomationWeekday[];
  time: string;
  monthDay?: number | undefined;
  startAt?: string | undefined;
  intervalEvery?: number | undefined;
  intervalUnit?: AutomationIntervalUnit | undefined;
}

export interface ProjectAutomation {
  id: string;
  enabled: boolean;
  title: string;
  prompt: string;
  schedule: ProjectAutomationSchedule;
  execution?: ProjectAutomationExecution | undefined;
  createdAt: string;
  updatedAt: string;
}

const AutomationWeekdaySchema = Schema.Literals(automationWeekdays);
const AutomationFrequencySchema = Schema.Literals([
  "daily",
  "weekly",
  "monthly",
  "multiple-weekly",
  "interval",
]);
const AutomationIntervalUnitSchema = Schema.Literals(["minute", "hour", "day"]);
const AutomationWorkspaceModeSchema = Schema.Literals(["new-worktree", "main-branch"]);

const ProjectAutomationExecutionSchema = Schema.Struct({
  archiveThread: Schema.Boolean,
  workspaceMode: AutomationWorkspaceModeSchema,
  branchName: Schema.optional(Schema.String),
});

const ProjectAutomationScheduleSchema = Schema.Struct({
  frequency: AutomationFrequencySchema,
  days: Schema.Array(AutomationWeekdaySchema),
  time: Schema.String,
  monthDay: Schema.optional(Schema.Number),
  startAt: Schema.optional(Schema.String),
  intervalEvery: Schema.optional(Schema.Number),
  intervalUnit: Schema.optional(AutomationIntervalUnitSchema),
});

const ProjectAutomationSchema = Schema.Struct({
  id: Schema.String,
  enabled: Schema.Boolean,
  title: Schema.String,
  prompt: Schema.String,
  schedule: ProjectAutomationScheduleSchema,
  execution: Schema.optional(ProjectAutomationExecutionSchema),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

const ProjectAutomationListSchema = Schema.Array(ProjectAutomationSchema);

export function projectAutomationsStorageKey(projectKey: string): string {
  return `t3code:project-automations:v1:${projectKey}`;
}

export function useProjectAutomations(
  projectKey: string,
): [
  readonly ProjectAutomation[],
  (
    value:
      | readonly ProjectAutomation[]
      | ((value: readonly ProjectAutomation[]) => readonly ProjectAutomation[]),
  ) => void,
] {
  return useLocalStorage(
    projectAutomationsStorageKey(projectKey),
    [] as readonly ProjectAutomation[],
    ProjectAutomationListSchema,
  ) as [
    readonly ProjectAutomation[],
    (
      value:
        | readonly ProjectAutomation[]
        | ((value: readonly ProjectAutomation[]) => readonly ProjectAutomation[]),
    ) => void,
  ];
}

export function createProjectAutomation(input: {
  title: string;
  prompt: string;
  schedule: ProjectAutomationSchedule;
  execution: ProjectAutomationExecution;
}): ProjectAutomation {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    enabled: true,
    title: input.title,
    prompt: input.prompt,
    schedule: input.schedule,
    execution: input.execution,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateProjectAutomation(
  automation: ProjectAutomation,
  patch: Partial<
    Pick<ProjectAutomation, "enabled" | "title" | "prompt" | "schedule" | "execution">
  >,
): ProjectAutomation {
  return {
    ...automation,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function formatWeekdayLabel(day: AutomationWeekday): string {
  return day.slice(0, 1).toUpperCase() + day.slice(1);
}

function formatMonthDayLabel(day: number): string {
  const normalized = Math.min(31, Math.max(1, Math.trunc(day)));
  const remainder = normalized % 10;
  const suffix =
    normalized >= 11 && normalized <= 13
      ? "th"
      : remainder === 1
        ? "st"
        : remainder === 2
          ? "nd"
          : remainder === 3
            ? "rd"
            : "th";
  return `${normalized}${suffix}`;
}

function formatDateLabel(dateValue: string): string {
  const parsed = Date.parse(dateValue);
  if (!Number.isFinite(parsed)) {
    return dateValue;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(parsed);
}

function formatIntervalUnitLabel(unit: AutomationIntervalUnit, every: number): string {
  const normalizedEvery = Math.max(1, Math.trunc(every));
  const label = unit === "minute" ? "minute" : unit === "hour" ? "hour" : "day";
  return normalizedEvery === 1 ? `every ${label}` : `every ${normalizedEvery} ${label}s`;
}

function resolveProjectAutomationExecution(
  execution?: ProjectAutomationExecution,
): ProjectAutomationExecution {
  return execution ?? { archiveThread: false, workspaceMode: "new-worktree" };
}

function formatProjectAutomationWorkspaceLabel(execution: ProjectAutomationExecution): string {
  if (execution.workspaceMode === "new-worktree") {
    return "New worktree";
  }
  return execution.branchName?.trim().length
    ? `Main worktree on ${execution.branchName.trim()}`
    : "Main worktree";
}

export function buildProjectAutomationExecutionLabel(
  execution?: ProjectAutomationExecution,
): string {
  const resolvedExecution = resolveProjectAutomationExecution(execution);
  const archiveLabel = resolvedExecution.archiveThread
    ? "Archive thread after run"
    : "Keep thread open after run";
  return `${archiveLabel} · ${formatProjectAutomationWorkspaceLabel(resolvedExecution)}`;
}

export function buildProjectAutomationStartLabel(startAt?: string): string {
  if (!startAt) {
    return "Starting soon";
  }
  return `Starting ${formatDateLabel(startAt)}`;
}

export function buildProjectAutomationScheduleLabel(schedule: ProjectAutomationSchedule): string {
  const time = schedule.time || "--:--";
  if (schedule.frequency === "daily") {
    return `${buildProjectAutomationStartLabel(schedule.startAt)} · Daily at ${time}`;
  }
  if (schedule.frequency === "weekly") {
    return `${buildProjectAutomationStartLabel(schedule.startAt)} · Weekly on ${formatWeekdayLabel(schedule.days[0] ?? "monday")} at ${time}`;
  }
  if (schedule.frequency === "monthly") {
    return `${buildProjectAutomationStartLabel(schedule.startAt)} · Monthly on the ${formatMonthDayLabel(schedule.monthDay ?? 1)} at ${time}`;
  }
  if (schedule.frequency === "multiple-weekly") {
    const days =
      schedule.days.length > 0 ? schedule.days.map(formatWeekdayLabel).join(", ") : "Any day";
    return `${buildProjectAutomationStartLabel(schedule.startAt)} · ${days} at ${time}`;
  }
  const intervalEvery = schedule.intervalEvery ?? 1;
  const intervalUnit = schedule.intervalUnit ?? "minute";
  return `${buildProjectAutomationStartLabel(schedule.startAt)} · ${formatIntervalUnitLabel(
    intervalUnit,
    intervalEvery,
  )}`;
}

export function buildProjectAutomationPromptPreview(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "No prompt configured";
  }
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

export function buildProjectAutomationUpdatedLabel(updatedAt: string): string {
  const parsed = Date.parse(updatedAt);
  if (!Number.isFinite(parsed)) {
    return "Recently updated";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export { ProjectAutomationListSchema, ProjectAutomationSchema, ProjectAutomationScheduleSchema };
