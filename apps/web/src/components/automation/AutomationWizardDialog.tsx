import { useAtomValue } from "@effect/atom-react";
import { useTheme } from "~/hooks/useTheme";
import {
  collectComposerSlashCommands,
  filterComposerSlashCommandsForAutocomplete,
} from "~/lib/composerSlashCommands";
import { useClientSettings } from "~/hooks/useSettings";
import { primaryServerProvidersAtom } from "../../state/server";
import {
  type ComposerTrigger,
  detectComposerTrigger,
  replaceTextRange,
} from "../../composer-logic";
import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "../ComposerPromptEditor";
import { ComposerCommandMenu, type ComposerCommandItem } from "../chat/ComposerCommandMenu";
import { buildComposerSlashCommandItems } from "../chat/composerSlashCommands";
import { searchSlashCommandItems } from "../chat/composerSlashCommandSearch";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { Checkbox } from "../ui/checkbox";
import { Switch } from "../ui/switch";
import { Dialog, DialogPopup } from "../ui/dialog";
import { Input } from "../ui/input";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { cn } from "~/lib/utils";
import { MultiStepWizardFrame } from "./MultiStepWizardFrame";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  automationWeekdays,
  buildProjectAutomationScheduleLabel,
  buildProjectAutomationStartLabel,
  buildProjectAutomationExecutionLabel,
  createProjectAutomation,
  type AutomationFrequency,
  type AutomationIntervalUnit,
  type AutomationWorkspaceMode,
  type AutomationWeekday,
  type ProjectAutomation,
  type ProjectAutomationSchedule,
} from "../../projectAutomations";

interface AutomationWizardDialogProps {
  open: boolean;
  projectName: string;
  onOpenChange: (open: boolean) => void;
  onCreateAutomation: (automation: ProjectAutomation) => void;
}

const frequencyOptions: Array<{ value: AutomationFrequency; label: string; description: string }> =
  [
    { value: "daily", label: "Daily", description: "Run once every day." },
    { value: "weekly", label: "Weekly", description: "Run on a chosen day each week." },
    { value: "monthly", label: "Monthly", description: "Run on a specific day of the month." },
    {
      value: "multiple-weekly",
      label: "Multiple times throughout a week",
      description: "Run on several days with one shared time.",
    },
    {
      value: "interval",
      label: "Interval",
      description: "Run every minute, hour, or day on a repeating cadence.",
    },
  ];

const weekdayLabels: Record<AutomationWeekday, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};

const intervalUnitLabels: Record<AutomationIntervalUnit, string> = {
  minute: "Minutes",
  hour: "Hours",
  day: "Days",
};

function defaultStartDate(): string {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function defaultScheduleForFrequency(frequency: AutomationFrequency): ProjectAutomationSchedule {
  const startAt = defaultStartDate();
  if (frequency === "weekly") {
    return { frequency, days: ["monday"], time: "09:00", startAt };
  }
  if (frequency === "monthly") {
    return { frequency, days: [], monthDay: 1, time: "09:00", startAt };
  }
  if (frequency === "multiple-weekly") {
    return { frequency, days: ["monday", "wednesday", "friday"], time: "09:00", startAt };
  }
  if (frequency === "interval") {
    return { frequency, days: [], time: "", startAt, intervalEvery: 15, intervalUnit: "minute" };
  }
  return { frequency, days: [], time: "09:00", startAt };
}

function deriveAutomationTitle(prompt: string, schedule: ProjectAutomationSchedule): string {
  const firstLine = prompt.trim().split(/\n+/)[0]?.trim() ?? "";
  if (firstLine.length > 0) {
    return firstLine.length > 48 ? `${firstLine.slice(0, 45)}...` : firstLine;
  }
  return buildProjectAutomationScheduleLabel(schedule);
}

function intervalSummary(schedule: ProjectAutomationSchedule): string {
  const every = Math.max(1, Math.trunc(schedule.intervalEvery ?? 1));
  const unit = schedule.intervalUnit ?? "minute";
  const label =
    unit === "minute"
      ? every === 1
        ? "minute"
        : "minutes"
      : unit === "hour"
        ? every === 1
          ? "hour"
          : "hours"
        : every === 1
          ? "day"
          : "days";
  return `Every ${every} ${label}`;
}

const extendReplacementRangeForTrailingSpace = (
  text: string,
  rangeEnd: number,
  replacement: string,
): number => {
  if (!replacement.endsWith(" ")) {
    return rangeEnd;
  }
  return text[rangeEnd] === " " ? rangeEnd + 1 : rangeEnd;
};

export function AutomationWizardDialog({
  open,
  projectName,
  onOpenChange,
  onCreateAutomation,
}: AutomationWizardDialogProps) {
  const providerSnapshots = useAtomValue(primaryServerProvidersAtom);
  const providerInstanceEntries = useMemo(
    () => deriveProviderInstanceEntries(providerSnapshots),
    [providerSnapshots],
  );
  const { resolvedTheme } = useTheme();
  const clientSettings = useClientSettings();
  const slashCommands = useMemo(() => {
    const commands = collectComposerSlashCommands(providerSnapshots, {
      hiddenSlashCommandsByProvider: clientSettings.hiddenProviderSlashCommands,
      customSlashCommands: clientSettings.customSlashCommands,
    });
    return filterComposerSlashCommandsForAutocomplete(commands, {
      hiddenCustomSlashCommands: clientSettings.hiddenCustomSlashCommands,
      hiddenGlobalSlashCommands: clientSettings.hiddenGlobalSlashCommands,
    });
  }, [
    clientSettings.customSlashCommands,
    clientSettings.hiddenCustomSlashCommands,
    clientSettings.hiddenGlobalSlashCommands,
    clientSettings.hiddenProviderSlashCommands,
    providerSnapshots,
  ]);
  const slashCommandSkills = useMemo(
    () => providerSnapshots.flatMap((provider) => provider.skills),
    [providerSnapshots],
  );

  const [step, setStep] = useState(1);
  const [frequency, setFrequency] = useState<AutomationFrequency>("daily");
  const [schedule, setSchedule] = useState<ProjectAutomationSchedule>(() =>
    defaultScheduleForFrequency("daily"),
  );
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [promptCursor, setPromptCursor] = useState(0);
  const [promptTrigger, setPromptTrigger] = useState<ComposerTrigger | null>(() =>
    detectComposerTrigger("", 0),
  );
  const [promptHighlightedItemId, setPromptHighlightedItemId] = useState<string | null>(null);
  const [monthDayError, setMonthDayError] = useState<string | null>(null);
  const [autoArchiveThread, setAutoArchiveThread] = useState(true);
  const [workspaceMode, setWorkspaceMode] = useState<AutomationWorkspaceMode>("new-worktree");
  const [branchName, setBranchName] = useState("");
  const promptEditorRef = useRef<ComposerPromptEditorHandle>(null);
  const promptMenuOpenRef = useRef(false);
  const promptMenuItemsRef = useRef<ComposerCommandItem[]>([]);
  const activePromptMenuItemRef = useRef<ComposerCommandItem | null>(null);
  const promptSelectLockRef = useRef(false);

  useEffect(() => {
    if (open) return;
    setStep(1);
    setFrequency("daily");
    setSchedule(defaultScheduleForFrequency("daily"));
    setTitle("");
    setPrompt("");
    setPromptCursor(0);
    setPromptTrigger(null);
    setPromptHighlightedItemId(null);
    setAutoArchiveThread(true);
    setWorkspaceMode("new-worktree");
    setBranchName("");
    setMonthDayError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      if (step === 3) {
        promptEditorRef.current?.focusAtEnd();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, step]);

  const scheduleSummary = useMemo(() => buildProjectAutomationScheduleLabel(schedule), [schedule]);
  const isIntervalSchedule = frequency === "interval";
  const promptMenuItems = useMemo<ComposerCommandItem[]>(() => {
    if (!promptTrigger || promptTrigger.kind !== "slash-command") return [];
    const slashCommandItems = buildComposerSlashCommandItems(
      providerInstanceEntries,
      clientSettings.hiddenProviderSlashCommands,
      clientSettings.customSlashCommands,
      clientSettings.hiddenCustomSlashCommands,
      clientSettings.hiddenGlobalSlashCommands,
    );
    return searchSlashCommandItems(slashCommandItems, promptTrigger.query);
  }, [
    clientSettings.customSlashCommands,
    clientSettings.hiddenCustomSlashCommands,
    clientSettings.hiddenGlobalSlashCommands,
    clientSettings.hiddenProviderSlashCommands,
    promptTrigger,
    providerInstanceEntries,
  ]);
  const promptMenuOpen = Boolean(promptTrigger?.kind === "slash-command");
  const promptMenuSearchKey = promptTrigger
    ? `${promptTrigger.kind}:${promptTrigger.query.trim().toLowerCase()}`
    : null;
  const activePromptMenuItem = useMemo(() => {
    if (promptMenuItems.length === 0) return null;
    const selectedItem =
      promptMenuItems.find((item) => item.id === promptHighlightedItemId) ?? promptMenuItems[0];
    return selectedItem ?? null;
  }, [promptHighlightedItemId, promptMenuItems]);

  promptMenuOpenRef.current = promptMenuOpen;
  promptMenuItemsRef.current = promptMenuItems;
  activePromptMenuItemRef.current = activePromptMenuItem;
  const isStepTwoValid =
    frequency === "daily"
      ? schedule.time.length > 0
      : frequency === "weekly"
        ? schedule.time.length > 0 && schedule.days.length > 0
        : frequency === "monthly"
          ? schedule.time.length > 0 &&
            Number.isInteger(schedule.monthDay) &&
            (schedule.monthDay ?? 0) >= 1
          : frequency === "multiple-weekly"
            ? schedule.time.length > 0 && schedule.days.length > 0
            : (schedule.intervalEvery ?? 0) >= 1 && (schedule.intervalUnit ?? null) !== null;
  const canContinueFromStepThree = title.trim().length > 0 && prompt.trim().length > 0;
  const canContinueFromStepFour = workspaceMode === "new-worktree" || branchName.trim().length > 0;
  const reviewTitle = title.trim();
  const titlePlaceholder = deriveAutomationTitle(prompt, schedule);
  const trimmedBranchName = branchName.trim();

  const goNext = () => setStep((current) => Math.min(5, current + 1));
  const goBack = () => setStep((current) => Math.max(1, current - 1));

  const handleFrequencyChange = (nextFrequency: AutomationFrequency) => {
    setFrequency(nextFrequency);
    setSchedule(defaultScheduleForFrequency(nextFrequency));
    setMonthDayError(null);
  };

  const updateStartAt = (nextStartAt: string) => {
    setSchedule((current) => ({ ...current, startAt: nextStartAt }));
  };

  const resolveActivePromptTrigger = useCallback((): {
    snapshot: { value: string; cursor: number; expandedCursor: number };
    trigger: ComposerTrigger | null;
  } => {
    const snapshot = promptEditorRef.current?.readSnapshot() ?? {
      value: prompt,
      cursor: promptCursor,
      expandedCursor: promptCursor,
    };
    return {
      snapshot,
      trigger: detectComposerTrigger(snapshot.value, snapshot.expandedCursor),
    };
  }, [prompt, promptCursor]);

  const onSelectPromptItem = useCallback(
    (item: ComposerCommandItem) => {
      if (promptSelectLockRef.current) return;
      promptSelectLockRef.current = true;
      window.requestAnimationFrame(() => {
        promptSelectLockRef.current = false;
      });

      const { snapshot, trigger } = resolveActivePromptTrigger();
      if (!trigger) return;

      if (item.type === "slash-command") {
        const replacement = `/${item.command} `;
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = replaceTextRange(
          snapshot.value,
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
        );
        setPrompt(applied.text);
        setPromptCursor(applied.cursor);
        setPromptTrigger(detectComposerTrigger(applied.text, applied.cursor));
        setPromptHighlightedItemId(null);
        return;
      }

      if (item.type === "provider-slash-command" || item.type === "custom-slash-command") {
        const replacement = `/${item.command.name} `;
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = replaceTextRange(
          snapshot.value,
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
        );
        setPrompt(applied.text);
        setPromptCursor(applied.cursor);
        setPromptTrigger(detectComposerTrigger(applied.text, applied.cursor));
        setPromptHighlightedItemId(null);
      }
    },
    [resolveActivePromptTrigger],
  );

  const onPromptCommandKey = useCallback(
    (key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab", event: KeyboardEvent) => {
      const menuIsActive = promptMenuOpenRef.current || promptTrigger !== null;
      if (!menuIsActive) {
        return false;
      }
      const currentItems = promptMenuItemsRef.current;
      const selectedItem = activePromptMenuItemRef.current ?? currentItems[0];
      if (key === "ArrowDown" && currentItems.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        const currentIndex = currentItems.findIndex((item) => item.id === promptHighlightedItemId);
        const nextIndex = (currentIndex + 1 + currentItems.length) % currentItems.length;
        setPromptHighlightedItemId(currentItems[nextIndex]?.id ?? null);
        return true;
      }
      if (key === "ArrowUp" && currentItems.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        const currentIndex = currentItems.findIndex((item) => item.id === promptHighlightedItemId);
        const nextIndex = (currentIndex - 1 + currentItems.length) % currentItems.length;
        setPromptHighlightedItemId(currentItems[nextIndex]?.id ?? null);
        return true;
      }
      if ((key === "Enter" || key === "Tab") && selectedItem) {
        event.preventDefault();
        event.stopPropagation();
        onSelectPromptItem(selectedItem);
        return true;
      }
      return false;
    },
    [
      activePromptMenuItemRef,
      onSelectPromptItem,
      promptHighlightedItemId,
      promptMenuSearchKey,
      promptTrigger,
    ],
  );

  const onPromptChange = useCallback(
    (
      nextValue: string,
      nextCursor: number,
      expandedCursor: number,
      cursorAdjacentToMention: boolean,
      terminalContextIds: string[],
    ) => {
      setPrompt(nextValue);
      setPromptCursor(nextCursor);
      setPromptTrigger(
        cursorAdjacentToMention ? null : detectComposerTrigger(nextValue, expandedCursor),
      );
      setPromptHighlightedItemId(null);
      void terminalContextIds;
    },
    [],
  );

  const handleAdd = () => {
    if (!canContinueFromStepThree || !canContinueFromStepFour) return;
    const automation = createProjectAutomation({
      title: title.trim(),
      prompt: prompt.trim(),
      schedule,
      execution: {
        archiveThread: autoArchiveThread,
        workspaceMode,
        ...(workspaceMode === "main-branch" ? { branchName: trimmedBranchName } : {}),
      },
    });
    onCreateAutomation(automation);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
          return;
        }
        onOpenChange(false);
      }}
    >
      <DialogPopup className="max-w-2xl">
        <MultiStepWizardFrame
          title="Create automation"
          description={`Build a scheduled automation for ${projectName}. You can use shared slash commands in the prompt step.`}
          steps={["Frequency", "Schedule", "Prompt", "Execution", "Review"]}
          activeStep={step - 1}
          onStepClick={(index) => setStep(index + 1)}
          error={null}
          onCancel={() => onOpenChange(false)}
          onBack={goBack}
          onNext={goNext}
          onConfirm={handleAdd}
          canGoBack={step > 1}
          canGoNext={step < 5}
          nextDisabled={
            (step === 2 && !isStepTwoValid) ||
            (step === 3 && !canContinueFromStepThree) ||
            (step === 4 && !canContinueFromStepFour)
          }
          confirmLabel="Add"
        >
          <div className="text-xs text-muted-foreground">
            Step {step} of 5 · {scheduleSummary}
          </div>

          {step === 1 ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Choose frequency</p>
                <p className="text-xs text-muted-foreground">
                  Pick how often this automation should run.
                </p>
              </div>
              <RadioGroup
                value={frequency}
                onValueChange={(value) => handleFrequencyChange(value as AutomationFrequency)}
                className="grid gap-2"
              >
                {frequencyOptions.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-muted/18 p-3 hover:bg-muted/30"
                  >
                    <RadioGroupItem value={option.value} className="mt-0.5" />
                    <div className="grid gap-0.5">
                      <span className="text-sm font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">
                  {isIntervalSchedule
                    ? "Set interval and start date"
                    : "Select day, time, and start date"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isIntervalSchedule
                    ? "Choose how often the automation repeats and when the schedule begins."
                    : "Schedule the automation for a day, time, and start date that fits the chosen frequency."}
                </p>
              </div>

              {isIntervalSchedule ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="grid gap-1.5 sm:col-span-1">
                    <span className="text-xs font-medium text-foreground">Every</span>
                    <Input
                      type="number"
                      min={1}
                      value={schedule.intervalEvery ?? 1}
                      onChange={(event) => {
                        const nextEvery = Number(event.target.value);
                        setSchedule((current) => ({
                          ...current,
                          intervalEvery: Number.isFinite(nextEvery)
                            ? Math.max(1, Math.trunc(nextEvery))
                            : 1,
                        }));
                      }}
                    />
                  </label>
                  <label className="grid gap-1.5 sm:col-span-1">
                    <span className="text-xs font-medium text-foreground">Unit</span>
                    <Select
                      value={schedule.intervalUnit ?? "minute"}
                      onValueChange={(value) =>
                        setSchedule((current) => ({
                          ...current,
                          intervalUnit: value as AutomationIntervalUnit,
                        }))
                      }
                    >
                      <SelectTrigger aria-label="Select interval unit">
                        <SelectValue>
                          {intervalUnitLabels[schedule.intervalUnit ?? "minute"]}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectPopup>
                        {Object.entries(intervalUnitLabels).map(([unit, label]) => (
                          <SelectItem key={unit} value={unit} hideIndicator>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </label>
                  <label className="grid gap-1.5 sm:col-span-1">
                    <span className="text-xs font-medium text-foreground">Start date</span>
                    <Input
                      type="date"
                      value={schedule.startAt ?? defaultStartDate()}
                      onChange={(event) => updateStartAt(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}

              {frequency === "weekly" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-foreground">Day of week</span>
                    <Select
                      value={schedule.days[0] ?? "monday"}
                      onValueChange={(value) =>
                        setSchedule((current) => ({
                          ...current,
                          days: [value as AutomationWeekday],
                        }))
                      }
                    >
                      <SelectTrigger aria-label="Select day of week">
                        <SelectValue>{weekdayLabels[schedule.days[0] ?? "monday"]}</SelectValue>
                      </SelectTrigger>
                      <SelectPopup>
                        {automationWeekdays.map((day) => (
                          <SelectItem key={day} value={day} hideIndicator>
                            {weekdayLabels[day]}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-foreground">Time</span>
                    <Input
                      type="time"
                      value={schedule.time}
                      onChange={(event) =>
                        setSchedule((current) => ({ ...current, time: event.target.value }))
                      }
                    />
                  </label>
                </div>
              ) : null}

              {frequency === "daily" ? (
                <label className="grid gap-1.5 sm:max-w-sm">
                  <span className="text-xs font-medium text-foreground">Time</span>
                  <Input
                    type="time"
                    value={schedule.time}
                    onChange={(event) =>
                      setSchedule((current) => ({ ...current, time: event.target.value }))
                    }
                  />
                </label>
              ) : null}

              {frequency === "monthly" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-foreground">Day of month</span>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={schedule.monthDay ?? 1}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (!Number.isFinite(value) || value < 1 || value > 31) {
                          setMonthDayError("Use a day between 1 and 31.");
                          setSchedule((current) => ({ ...current, monthDay: undefined }));
                          return;
                        }
                        setMonthDayError(null);
                        setSchedule((current) => ({ ...current, monthDay: value }));
                      }}
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-foreground">Time</span>
                    <Input
                      type="time"
                      value={schedule.time}
                      onChange={(event) =>
                        setSchedule((current) => ({ ...current, time: event.target.value }))
                      }
                    />
                  </label>
                </div>
              ) : null}

              {frequency === "multiple-weekly" ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-foreground">Days</p>
                    <p className="text-xs text-muted-foreground">
                      Choose one or more days for this automation.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {automationWeekdays.map((day) => {
                      const checked = schedule.days.includes(day);
                      return (
                        <label
                          key={day}
                          className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/18 px-3 py-2 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(nextChecked) => {
                              setSchedule((current) => {
                                const nextDays = new Set(current.days);
                                if (nextChecked === true) {
                                  nextDays.add(day);
                                } else {
                                  nextDays.delete(day);
                                }
                                return {
                                  ...current,
                                  days: Array.from(nextDays) as AutomationWeekday[],
                                };
                              });
                            }}
                          />
                          <span>{weekdayLabels[day]}</span>
                        </label>
                      );
                    })}
                  </div>
                  <label className="grid gap-1.5 sm:max-w-sm">
                    <span className="text-xs font-medium text-foreground">Time</span>
                    <Input
                      type="time"
                      value={schedule.time}
                      onChange={(event) =>
                        setSchedule((current) => ({ ...current, time: event.target.value }))
                      }
                    />
                  </label>
                </div>
              ) : null}

              {!isIntervalSchedule ? (
                <label className="grid gap-1.5 sm:max-w-sm">
                  <span className="text-xs font-medium text-foreground">Start date</span>
                  <Input
                    type="date"
                    value={schedule.startAt ?? defaultStartDate()}
                    onChange={(event) => updateStartAt(event.target.value)}
                  />
                </label>
              ) : null}

              {monthDayError ? <p className="text-xs text-destructive">{monthDayError}</p> : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="space-y-1.5 text-sm font-medium">
                  <span>Automation title</span>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={titlePlaceholder}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  Give this automation a clear name so it’s easy to recognize later.
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">Create the prompt</p>
                <p className="text-xs text-muted-foreground">
                  Use plain text or shared slash commands to shape the automation prompt.
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <div className="relative">
                  {promptMenuOpen ? (
                    <div className="absolute inset-x-0 bottom-full z-20 mb-2">
                      <ComposerCommandMenu
                        items={promptMenuItems}
                        resolvedTheme={resolvedTheme}
                        isLoading={false}
                        triggerKind={promptTrigger?.kind ?? null}
                        groupSlashCommandSections={promptTrigger?.kind === "slash-command"}
                        activeItemId={activePromptMenuItem?.id ?? null}
                        onHighlightedItemChange={(itemId) => {
                          setPromptHighlightedItemId(itemId);
                        }}
                        onSelect={onSelectPromptItem}
                      />
                    </div>
                  ) : null}
                  <ComposerPromptEditor
                    value={prompt}
                    cursor={promptCursor}
                    terminalContexts={[]}
                    skills={slashCommandSkills}
                    slashCommands={slashCommands}
                    disabled={false}
                    placeholder="Describe the work this automation should perform..."
                    className="min-h-40"
                    onRemoveTerminalContext={() => undefined}
                    onChange={onPromptChange}
                    onCommandKeyDown={onPromptCommandKey}
                    onPaste={() => undefined}
                    editorRef={promptEditorRef}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Thread behavior</p>
                <p className="text-xs text-muted-foreground">
                  Decide how the automation should handle the thread and working tree.
                </p>
              </div>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/18 px-4 py-3 text-sm">
                <div className="space-y-1">
                  <p className="font-medium">Auto-archive thread</p>
                  <p className="text-xs text-muted-foreground">
                    Archive the thread automatically when the automation finishes.
                  </p>
                </div>
                <Switch checked={autoArchiveThread} onCheckedChange={setAutoArchiveThread} />
              </label>

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Workspace</p>
                  <p className="text-xs text-muted-foreground">
                    Choose whether the automation runs in a fresh worktree or the main checkout.
                  </p>
                </div>

                <RadioGroup
                  value={workspaceMode}
                  onValueChange={(value) => setWorkspaceMode(value as AutomationWorkspaceMode)}
                  className="grid gap-2"
                >
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-background px-4 py-3 text-sm transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="new-worktree" />
                    <div className="space-y-1">
                      <p className="font-medium">New worktree</p>
                      <p className="text-xs text-muted-foreground">
                        Create an isolated worktree for each automation run.
                      </p>
                    </div>
                  </label>

                  <div className="space-y-3 rounded-xl border border-border/70 bg-background px-4 py-3 text-sm transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
                    <label className="flex cursor-pointer items-start gap-3">
                      <RadioGroupItem value="main-branch" />
                      <div className="space-y-1">
                        <p className="font-medium">Main worktree on a branch</p>
                        <p className="text-xs text-muted-foreground">
                          Run directly in the main checkout on a specific branch.
                        </p>
                      </div>
                    </label>
                    {workspaceMode === "main-branch" ? (
                      <label className="grid gap-1.5 pl-7">
                        <span className="text-xs font-medium text-foreground">Branch name</span>
                        <Input
                          value={branchName}
                          onChange={(event) => setBranchName(event.target.value)}
                          placeholder="main"
                        />
                      </label>
                    ) : null}
                  </div>
                </RadioGroup>
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Review and confirm</p>
                <p className="text-xs text-muted-foreground">
                  Check the details, then add the automation.
                </p>
              </div>
              <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/18 p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Name</span>
                  <span className="text-right font-medium">{reviewTitle}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Frequency</span>
                  <span className="text-right font-medium capitalize">
                    {frequency.replace("-", " ")}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Schedule</span>
                  <span className="text-right font-medium">
                    {frequency === "interval" ? intervalSummary(schedule) : scheduleSummary}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Start</span>
                  <span className="text-right font-medium">
                    {buildProjectAutomationStartLabel(schedule.startAt)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Prompt</span>
                  <span className="max-w-[20rem] text-right text-muted-foreground">
                    {prompt.trim().length > 0 ? prompt.trim() : "No prompt set"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Thread behavior</span>
                  <span className="max-w-[20rem] text-right text-muted-foreground">
                    {buildProjectAutomationExecutionLabel({
                      archiveThread: autoArchiveThread,
                      workspaceMode,
                      ...(workspaceMode === "main-branch" && trimmedBranchName.length > 0
                        ? { branchName: trimmedBranchName }
                        : {}),
                    })}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </MultiStepWizardFrame>
      </DialogPopup>
    </Dialog>
  );
}
