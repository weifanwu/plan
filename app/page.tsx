"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { applyAIOperations } from "../lib/ai-operations.mjs";
import { rollOverTasks } from "../lib/task-rollover.mjs";
import { isRoutineDueOn, nextRoutineOccurrence, routineFrequencyLabel, routineIntervalDays, routineTodayEntry } from "../lib/routine-schedule.mjs";
import { shiftTaskToDate } from "../lib/task-reschedule.mjs";
import { isCompletedTaskArchived } from "../lib/task-retention.mjs";
import { isTaskVisibleToday } from "../lib/task-visibility.mjs";
import { mergeSyncPayload, syncPayloadEquals, toSyncPayload } from "../lib/sync-state.mjs";
import FitnessModule from "./components/FitnessModule";
import MealPlannerModule from "./components/MealPlannerModule";
import { defaultExercises, defaultTrainingPlans } from "../lib/fitness-data";
import type { ActivityLog, ExerciseDefinition, ExerciseLog, TrainingPlan } from "../lib/fitness-types";
import { defaultMealRecipes, defaultMealThemes } from "../lib/meal-data";
import type { MealPlanEntry, MealRecipe, MealTheme } from "../lib/meal-types";

type View = "today" | "goals" | "semester" | "career" | "planner" | "notes" | "vault" | "meals" | "wellness";
type TaskCategory = "学业" | "求职" | "生活" | "健康";
type TaskStatus = "todo" | "done";
type NoteCategory = "待办" | "想法" | "课程" | "项目" | "求职" | "生活";
type RoutineFrequency = "daily" | "interval";

type Task = {
  id: string;
  title: string;
  details?: string | null;
  category: TaskCategory;
  date: string;
  time?: string | null;
  endDate?: string | null;
  carriedFrom?: string | null;
  completedAt?: string | null;
  goalId?: string | null;
  priority: "high" | "normal";
  status: TaskStatus;
};

type ScheduleItem = {
  id: string;
  code: string;
  title: string;
  kind: "课程" | "TA" | "个人";
  days: string[];
  start: string;
  end: string;
  room: string;
  detail?: string | null;
  color: "lime" | "coral" | "lavender" | "blue";
};

type Goal = {
  id: string;
  title: string;
  description: string;
  metric: string;
  progress: number;
  tone: "lime" | "coral" | "lavender";
};

type ActivePhase = {
  goalId?: string | null;
  label: string;
  title: string;
  outcome: string;
  description: string;
  startDate: string;
  endDate: string;
};

type Habit = { id: string; label: string; done: boolean; icon: string };
type Workout = { id: string; title: string; day: string; duration: string; done: boolean };
type ApplicationStage = "已投" | "面试" | "Offer" | "拒绝";
type Application = { id: string; company: string; role: string; stage: ApplicationStage; link: string; contact: string; date: string; notes: string };
type Note = { id: string; content: string; category: NoteCategory; pinned: boolean; createdAt: string; updatedAt: string };
type Routine = { id: string; title: string; details: string; category: TaskCategory; goalId?: string | null; startDate: string; time?: string | null; frequency: RoutineFrequency; intervalDays: number; active: boolean; completedDates: string[] };
type ReferenceNote = { id: string; title: string; content: string; pinned: boolean; aiExcluded: boolean; createdAt: string; updatedAt: string };
type AIPlanPreview = { summary: string; changes: string[]; nextData: AppData };
type AIModel = "gpt-5.6-luna" | "gpt-5.6-terra" | "gpt-5.6-sol" | "gpt-5.4-mini" | "gpt-5.4";
type AIChatMessage = { id: string; role: "user" | "assistant"; content: string };
type AICollection = "tasks" | "routines" | "schedule" | "goals" | "habits" | "workouts" | "trainingPlans" | "exercises" | "exerciseLogs" | "activityLogs" | "mealThemes" | "mealPlans" | "mealRecipes" | "applications" | "notes" | "references";
type AIOperation = { collection: AICollection; operation: "add" | "update" | "delete" | "reorder"; recordId: string; recordJson: string };
type AIChatResponse = { reply: string; action: "answer" | "proposal"; summary: string; operations: AIOperation[]; error?: string };
type VoiceState = "idle" | "recording" | "transcribing";
type PlannerStatusFilter = "open" | "done" | "all";
type SemesterWeekModule = "schedule" | "tasks";
type RecordCollection = "tasks" | "routines" | "schedule" | "goals" | "habits" | "workouts" | "trainingPlans" | "exercises" | "exerciseLogs" | "activityLogs" | "mealThemes" | "mealPlans" | "mealRecipes" | "applications" | "notes" | "references";
type UndoNotice = { message: string; restore: (current: AppData) => AppData };
type PWAInstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type TaskPrefill = { title: string; details: string; category: TaskCategory };

type AppData = {
  phase: ActivePhase;
  tasks: Task[];
  routines: Routine[];
  schedule: ScheduleItem[];
  goals: Goal[];
  habits: Habit[];
  workouts: Workout[];
  trainingPlans: TrainingPlan[];
  exercises: ExerciseDefinition[];
  exerciseLogs: ExerciseLog[];
  activityLogs: ActivityLog[];
  mealThemes: MealTheme[];
  mealPlans: MealPlanEntry[];
  mealRecipes: MealRecipe[];
  applications: Application[];
  notes: Note[];
  references: ReferenceNote[];
  habitDate: string;
  workoutWeek: string;
};

type SyncedAppData = AppData;
type SyncStatus = "local" | "syncing" | "synced" | "pending" | "conflict" | "error";
type SyncEnvelope = { initialized: boolean; data: SyncedAppData | null; revision: number; updatedAt: string | null; error?: string };
type SyncMeta = { revision: number; baseData: SyncedAppData };
type VoiceTarget = "ai" | "draft" | "idea";

const DAY_ORDER = ["Mo", "Tu", "We", "Th", "Fr"];
const DAY_LABEL: Record<string, string> = { Mo: "周一", Tu: "周二", We: "周三", Th: "周四", Fr: "周五" };
const CALENDAR_DAY_ORDER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const CALENDAR_DAY_LABEL = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const APPLICATION_STAGES: ApplicationStage[] = ["已投", "面试", "Offer", "拒绝"];
const NOTE_CATEGORIES: NoteCategory[] = ["待办", "想法", "课程", "项目", "求职", "生活"];
const BASE_DATE = "2026-08-23";
const STORAGE_KEY = "map-life-os-v1";
const SEMESTER_LAYOUT_STORAGE_KEY = "map-semester-week-layout-v1";
const NAV_ORDER_STORAGE_KEY = "map-navigation-order-v1";
const SYNC_META_KEY = "map-sync-meta-v1";
const SYNC_DIRTY_KEY = "map-sync-dirty-v1";
const DEFAULT_SEMESTER_WEEK_ORDER: SemesterWeekModule[] = ["schedule", "tasks"];
const DEFAULT_NAV_ORDER: View[] = ["today", "goals", "semester", "career", "planner", "notes", "vault", "meals", "wellness"];
const NAV_LABELS: Record<View, string> = { today: "今日指挥台", goals: "长期目标", semester: "阶段地图", career: "求职记录", planner: "任务计划", notes: "草稿箱", vault: "私人速记", meals: "饮食计划", wellness: "健身与健康" };
const AI_WELCOME_MESSAGE: AIChatMessage = { id: "welcome", role: "assistant", content: "你好，我是 MAP AI。我能看到你当前阶段、长期目标、任务、固定任务、课表、求职记录、饮食与训练计划和草稿，也知道哪些行动正在服务哪个目标。你可以让我分析现状、回答问题，或者一起把一个想法变成计划；任何数据修改都会先给你预览。私人速记只有在你明确开启“AI 可读 · 云端同步”并要求管理它时才会加入上下文。" };
const LEGACY_TASK_GOALS: Record<string, string> = { stephnie: "graduate", leetcode: "career", fees: "graduate", applications: "career", pte: "graduate", irene: "graduate" };

function getTorontoToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function getWeekKey(dateString = getTorontoToday()) {
  const date = new Date(`${dateString}T12:00:00`);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date.toISOString().slice(0, 10);
}

function buildWeekDays(dateString: string) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  const weekStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart + index * 86400000);
    return { key: day.toISOString().slice(0, 10), dayCode: CALENDAR_DAY_ORDER[index], label: CALENDAR_DAY_LABEL[index], date: `${day.getUTCMonth() + 1}/${day.getUTCDate()}` };
  });
}

function buildCalendarCells(cursor: string) {
  const [year, month] = cursor.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
  const gridStart = Date.UTC(year, month - 1, 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart + index * 86400000);
    const key = date.toISOString().slice(0, 10);
    const weekdayIndex = (date.getUTCDay() + 6) % 7;
    return { key, day: date.getUTCDate(), inMonth: date.getUTCMonth() === month - 1, dayCode: CALENDAR_DAY_ORDER[weekdayIndex] };
  });
}

function moveMonth(cursor: string, distance: number) {
  const [year, month] = cursor.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + distance, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizeSemesterWeekOrder(value: unknown): SemesterWeekModule[] {
  if (!Array.isArray(value)) return DEFAULT_SEMESTER_WEEK_ORDER;
  const order = value.filter((item): item is SemesterWeekModule => item === "schedule" || item === "tasks");
  return order.length === DEFAULT_SEMESTER_WEEK_ORDER.length && new Set(order).size === DEFAULT_SEMESTER_WEEK_ORDER.length ? order : DEFAULT_SEMESTER_WEEK_ORDER;
}

function normalizeApplications(applications: Application[] = []) {
  return applications.map((application) => ({ ...application, stage: APPLICATION_STAGES.includes(application.stage as ApplicationStage) ? application.stage as ApplicationStage : "已投" as ApplicationStage }));
}

function normalizeTasks(tasks: Task[] = []) {
  return tasks.map((task) => ({ ...task, details: task.details ?? null, time: task.time ?? null, endDate: task.endDate ?? null, carriedFrom: task.carriedFrom ?? null, completedAt: task.completedAt ?? null, goalId: task.goalId ?? LEGACY_TASK_GOALS[task.id] ?? null }));
}

function normalizeTaskGoals(tasks: Task[] = [], goals: Goal[] = []) {
  const goalIds = new Set(goals.map((goal) => goal.id));
  return normalizeTasks(tasks).map((task) => task.goalId && !goalIds.has(task.goalId) ? { ...task, goalId: null } : task);
}

function normalizeSchedule(schedule: ScheduleItem[] = []) {
  return schedule.map((item) => ({ ...item, detail: item.detail ?? null }));
}

function normalizeRoutines(routines: Routine[] = [], goals: Goal[] = []) {
  const goalIds = new Set(goals.map((goal) => goal.id));
  return routines.flatMap((routine) => {
    if (!routine || typeof routine.id !== "string" || typeof routine.title !== "string" || typeof routine.startDate !== "string") return [];
    const frequency: RoutineFrequency = routine.frequency === "interval" ? "interval" : "daily";
    return [{
      ...routine,
      details: typeof routine.details === "string" ? routine.details : "",
      category: (["学业", "求职", "生活", "健康"] as TaskCategory[]).includes(routine.category) ? routine.category : "生活",
      goalId: routine.goalId && goalIds.has(routine.goalId) ? routine.goalId : null,
      time: typeof routine.time === "string" ? routine.time : null,
      frequency,
      intervalDays: frequency === "daily" ? 1 : routineIntervalDays(routine),
      active: routine.active !== false,
      completedDates: Array.isArray(routine.completedDates) ? [...new Set(routine.completedDates.filter((date) => typeof date === "string"))].sort() : [],
    }];
  });
}

function normalizeReferences(references: ReferenceNote[] = []) {
  return references.flatMap((reference) => {
    if (!reference || typeof reference.id !== "string" || typeof reference.content !== "string") return [];
    const now = new Date().toISOString();
    return [{ id: reference.id, title: typeof reference.title === "string" && reference.title.trim() ? reference.title : referenceTitleFromContent(reference.content), content: reference.content, pinned: Boolean(reference.pinned), aiExcluded: reference.aiExcluded !== false, createdAt: typeof reference.createdAt === "string" ? reference.createdAt : now, updatedAt: typeof reference.updatedAt === "string" ? reference.updatedAt : now }];
  });
}

function normalizeNavOrder(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_NAV_ORDER;
  const valid = value.filter((item): item is View => typeof item === "string" && DEFAULT_NAV_ORDER.includes(item as View));
  return [...new Set([...valid, ...DEFAULT_NAV_ORDER])];
}

function mergeDeviceAndCloudReferences(deviceReferences: ReferenceNote[], cloudReferences: ReferenceNote[]) {
  const cloudById = new Map(normalizeReferences(cloudReferences).filter((reference) => reference.aiExcluded === false).map((reference) => [reference.id, reference]));
  const result: ReferenceNote[] = [];
  const seen = new Set<string>();
  for (const reference of normalizeReferences(deviceReferences)) {
    // A local-only record always wins over a cloud record with the same id.
    // Opted-in records are refreshed from the merged cloud payload.
    const next = reference.aiExcluded ? reference : cloudById.get(reference.id);
    if (next) { result.push(next); seen.add(next.id); }
  }
  for (const reference of cloudById.values()) if (!seen.has(reference.id)) result.push(reference);
  return result;
}

const initialData: AppData = {
  phase: {
    goalId: "graduate",
    label: "FALL · 2026",
    title: "毕业冲刺",
    outcome: "顺利毕业",
    description: "课程、TA、求职和身体状态都服务于同一个结果：年底稳稳完成学业，同时不把自己耗尽。",
    startDate: "2026-09-01",
    endDate: "2026-12-28",
  },
  goals: [
    { id: "graduate", title: "顺利毕业", description: "完成三门课程、TA 工作与英语毕业要求", metric: "2026 · Fall", progress: 0, tone: "lime" },
    { id: "career", title: "找到更好的机会", description: "已有一年实习保底，只投明显更优的岗位", metric: "长期推进", progress: 8, tone: "coral" },
    { id: "health", title: "保持身体在线", description: "稳定运动，照顾饮食，而不是毕业前透支", metric: "每周复盘", progress: 33, tone: "lavender" },
  ],
  schedule: [
    { id: "cas720", code: "CAS 720", title: "Future Resilient Databases", kind: "课程", days: ["Tu", "Fr"], start: "12:00", end: "13:30", room: "ITB 222", color: "lime" },
    { id: "cas746", code: "CAS 746", title: "Advanced Topics in Combinatorial Optimization", kind: "课程", days: ["Fr"], start: "13:30", end: "16:30", room: "ITB 222", detail: "Antoine Deza", color: "coral" },
    { id: "sep793", code: "SEP 793", title: "Entrepreneurial Opportunity Identification", kind: "课程", days: ["Mo"], start: "09:30", end: "12:30", room: "ETB 539", detail: "S. Srinivasan", color: "lavender" },
    { id: "ta", code: "TA · SFWRENG", title: "Tutorial T01 · T02 · T03", kind: "TA", days: ["We"], start: "12:30", end: "14:20", room: "待确认", color: "blue" },
  ],
  tasks: [
    { id: "stephnie", title: "解决 Stephnie 发的邮件", category: "生活", goalId: "graduate", date: BASE_DATE, time: "09:00", priority: "high", status: "todo" },
    { id: "leetcode", title: "开始刷题", category: "求职", goalId: "career", date: BASE_DATE, time: "09:00", priority: "high", status: "todo" },
    { id: "medical", title: "报销医药费", category: "生活", date: BASE_DATE, time: "09:00", priority: "high", status: "todo" },
    { id: "fees", title: "交学费和房租", category: "学业", goalId: "graduate", date: BASE_DATE, time: "09:00", priority: "high", status: "todo" },
    { id: "applications", title: "开始筛选并投递更好的工作", category: "求职", goalId: "career", date: BASE_DATE, time: "09:00", priority: "normal", status: "todo" },
    { id: "pte", title: "准备英语毕业要求并报名 PTE", category: "学业", goalId: "graduate", date: BASE_DATE, time: "09:00", priority: "high", status: "todo" },
    { id: "irene", title: "给 Irene 发邮件确认上课", category: "学业", goalId: "graduate", date: BASE_DATE, time: "14:00", priority: "high", status: "todo" },
    { id: "travel", title: "决定去哪里旅行", category: "生活", date: BASE_DATE, time: "22:00", priority: "normal", status: "todo" },
    { id: "passport", title: "开始续护照，避免影响工签期限", category: "生活", date: "2026-08-24", time: "09:00", priority: "high", status: "todo" },
    { id: "haircut", title: "剪头发", category: "生活", date: "2026-08-25", time: "14:00", priority: "normal", status: "todo" },
    { id: "immigration", title: "研究移民政策", category: "生活", date: "2026-08-25", time: "09:00", endDate: "2026-08-30", priority: "normal", status: "todo" },
    { id: "driving", title: "安排考驾照并开始找教练", category: "生活", date: BASE_DATE, endDate: "2026-09-04", priority: "normal", status: "todo" },
  ],
  routines: [
    { id: "routine-job-search", title: "找工作 / 筛选并投递岗位", details: "寻找明显优于现有实习 Offer 的机会", category: "求职", goalId: "career", startDate: "2026-08-24", time: "09:00", frequency: "interval", intervalDays: 2, active: true, completedDates: [] },
  ],
  habits: [
    { id: "water", label: "喝够水", done: false, icon: "水" },
    { id: "fruit", label: "吃水果", done: false, icon: "果" },
    { id: "veg", label: "吃蔬菜", done: false, icon: "菜" },
    { id: "protein", label: "摄入蛋白质", done: false, icon: "蛋" },
  ],
  workouts: [
    { id: "w1", title: "力量训练", day: "周二", duration: "45 分钟", done: false },
    { id: "w2", title: "有氧 / 快走", day: "周四", duration: "40 分钟", done: false },
    { id: "w3", title: "力量训练", day: "周六", duration: "45 分钟", done: false },
  ],
  trainingPlans: defaultTrainingPlans,
  exercises: defaultExercises,
  exerciseLogs: [],
  activityLogs: [],
  mealThemes: defaultMealThemes,
  mealPlans: [],
  mealRecipes: defaultMealRecipes,
  applications: [],
  notes: [],
  references: [],
  habitDate: getTorontoToday(),
  workoutWeek: getWeekKey(),
};

function hydrateAppData(parsed: Partial<AppData>, currentDay: string, deviceReferences: ReferenceNote[] = initialData.references): AppData {
  const currentWeek = getWeekKey(currentDay);
  const savedHabits = parsed.habits || initialData.habits;
  const savedWorkouts = parsed.workouts || initialData.workouts;
  const savedGoals = parsed.goals || initialData.goals;
  const savedPhase = { ...initialData.phase, ...(parsed.phase || {}) };
  if (savedPhase.goalId && !savedGoals.some((goal) => goal.id === savedPhase.goalId)) savedPhase.goalId = null;
  return {
    ...initialData,
    ...parsed,
    phase: savedPhase,
    tasks: normalizeTaskGoals(rollOverTasks(parsed.tasks || initialData.tasks, currentDay), savedGoals),
    routines: normalizeRoutines(parsed.routines || initialData.routines, savedGoals),
    schedule: normalizeSchedule(parsed.schedule || initialData.schedule),
    goals: savedGoals,
    habits: parsed.habitDate === currentDay ? savedHabits : savedHabits.map((habit) => ({ ...habit, done: false })),
    workouts: parsed.workoutWeek === currentWeek ? savedWorkouts : savedWorkouts.map((workout) => ({ ...workout, done: false })),
    trainingPlans: Array.isArray(parsed.trainingPlans) ? parsed.trainingPlans : defaultTrainingPlans,
    exercises: Array.isArray(parsed.exercises) ? parsed.exercises : defaultExercises,
    exerciseLogs: Array.isArray(parsed.exerciseLogs) ? parsed.exerciseLogs : [],
    activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : [],
    mealThemes: Array.isArray(parsed.mealThemes) ? parsed.mealThemes : defaultMealThemes,
    mealPlans: Array.isArray(parsed.mealPlans) ? parsed.mealPlans : [],
    mealRecipes: Array.isArray(parsed.mealRecipes) ? parsed.mealRecipes : defaultMealRecipes,
    applications: normalizeApplications(parsed.applications),
    notes: parsed.notes || initialData.notes,
    references: normalizeReferences(parsed.references || deviceReferences),
    habitDate: currentDay,
    workoutWeek: currentWeek,
  };
}

const categoryTone: Record<TaskCategory, string> = { 学业: "lime", 求职: "coral", 生活: "blue", 健康: "lavender" };

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function deriveAIChanges(current: AppData, next: AppData) {
  const collections: Array<[AICollection, string]> = [["tasks", "任务"], ["routines", "固定任务"], ["schedule", "固定安排"], ["goals", "目标"], ["habits", "饮食习惯"], ["workouts", "旧版运动"], ["trainingPlans", "训练计划"], ["exercises", "动作"], ["exerciseLogs", "力量记录"], ["activityLogs", "运动记录"], ["mealThemes", "饮食主题"], ["mealPlans", "用餐安排"], ["mealRecipes", "菜谱"], ["applications", "求职记录"], ["notes", "草稿"], ["references", "私人速记"]];
  const changes: string[] = [];
  const displayName = (item: Record<string, unknown>) => String(item.title || item.company || item.label || item.code || item.content || item.id || "未命名记录").split("\n")[0].slice(0, 60);
  for (const [key, label] of collections) {
    const before = current[key] as unknown as Array<Record<string, unknown> & { id: string }>;
    const after = next[key] as unknown as Array<Record<string, unknown> & { id: string }>;
    const beforeMap = new Map(before.map((item) => [item.id, item]));
    const afterMap = new Map(after.map((item) => [item.id, item]));
    for (const item of after) {
      if (!beforeMap.has(item.id)) changes.push(`新增${label}：${displayName(item)}`);
      else if (JSON.stringify(beforeMap.get(item.id)) !== JSON.stringify(item)) changes.push(`修改${label}：${displayName(item)}`);
    }
    for (const item of before) if (!afterMap.has(item.id)) changes.push(`删除${label}：${displayName(item)}`);
  }
  if (changes.length === 0) return ["没有检测到实际数据变化。"];
  return changes.length > 40 ? [...changes.slice(0, 40), `另有 ${changes.length - 40} 项变更`] : changes;
}

function formatDate(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return `${value.getMonth() + 1}月${value.getDate()}日`;
}

function formatWeekday(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function formatShortDate(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", timeZone: "UTC" }).format(value);
}

function daysBetween(from: string, to: string) {
  return Math.ceil((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

function isMultiDayTask(task: Task) {
  return Boolean(task.endDate && task.endDate > task.date);
}

function buildPhaseStops(phase: ActivePhase) {
  const start = new Date(`${phase.startDate}T12:00:00Z`);
  const end = new Date(`${phase.endDate}T12:00:00Z`);
  const interior: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor < end && interior.length < 3) {
    interior.push(new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(cursor).toUpperCase());
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  while (interior.length < 3) interior.push(`STEP ${interior.length + 1}`);
  return ["现在", ...interior.slice(0, 3), "完成"];
}

function buildPhaseCheckpoints(phase: ActivePhase) {
  const start = Date.parse(`${phase.startDate}T12:00:00Z`);
  const end = Math.max(start, Date.parse(`${phase.endDate}T12:00:00Z`));
  const titles = ["启动阶段", "建立节奏", "中段复盘", "完成阶段"];
  const descriptions = ["明确结果和约束，把必须发生的固定安排放进系统。", "稳定执行，不靠临时冲刺维持进度。", "检查偏差，删掉低价值动作，把风险提前暴露。", "提前收口关键事项，确认结果并记录下一阶段。"];
  const tones = ["lime", "blue", "lavender", "coral"];
  return titles.map((title, index) => ({
    title,
    text: descriptions[index],
    tone: tones[index],
    date: new Date(start + ((end - start) * index) / 3).toISOString().slice(0, 10),
  }));
}

function dateCardParts(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return {
    day: String(value.getDate()),
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(value).toUpperCase(),
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(value).toUpperCase(),
  };
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function goalPriorityLabel(index: number) {
  if (index === 0) return "最重要";
  if (index === 1) return "第二重要";
  if (index === 2) return "第三重要";
  return `第 ${index + 1} 顺位`;
}

function noteTitle(note: Note) {
  return note.content.split("\n").find((line) => line.trim())?.trim().slice(0, 80) || "无标题草稿";
}

function notePreview(note: Note) {
  const lines = note.content.split("\n").filter((line) => line.trim());
  return (lines.length > 1 ? lines.slice(1).join("\n") : note.content).trim();
}

function referenceTitleFromContent(content: string) {
  const firstLine = content.split("\n").find((line) => line.trim())?.trim() || "无标题资料";
  try {
    if (/^https?:\/\//i.test(firstLine)) return new URL(firstLine).hostname.replace(/^www\./, "") || "常用网址";
  } catch { /* use the original first line */ }
  return firstLine.slice(0, 80);
}

function referencePreview(reference: ReferenceNote) {
  const lines = reference.content.split("\n").map((line) => line.trim()).filter(Boolean);
  const withoutTitle = lines[0] === reference.title ? lines.slice(1) : lines;
  return (withoutTitle.join(" · ") || reference.content).slice(0, 180);
}

function extractReferenceLinks(content: string) {
  const matches = content.match(/https?:\/\/[^\s<>"']+/gi) || [];
  return [...new Set(matches.map((link) => link.replace(/[),.;，。；）]+$/, "")))].slice(0, 12);
}

function referenceLinkLabel(link: string) {
  try { return new URL(link).hostname.replace(/^www\./, "") || link; } catch { return link; }
}

function taskCategoryFromNote(category: NoteCategory): TaskCategory {
  if (category === "课程") return "学业";
  if (category === "求职") return "求职";
  if (category === "生活") return "生活";
  return "生活";
}

function formatNoteTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "America/Toronto", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function Home() {
  const [view, setView] = useState<View>("today");
  const [data, setData] = useState<AppData>(initialData);
  const [ready, setReady] = useState(false);
  const [taskEditor, setTaskEditor] = useState<Task | "new" | null>(null);
  const [routineEditor, setRoutineEditor] = useState<Routine | "new" | null>(null);
  const [newTaskDate, setNewTaskDate] = useState<string | null>(null);
  const [newTaskGoalId, setNewTaskGoalId] = useState<string | null>(null);
  const [taskPrefill, setTaskPrefill] = useState<TaskPrefill | null>(null);
  const [promotingNoteId, setPromotingNoteId] = useState<string | null>(null);
  const [phaseEditor, setPhaseEditor] = useState(false);
  const [scheduleEditor, setScheduleEditor] = useState<ScheduleItem | "new" | null>(null);
  const [goalEditor, setGoalEditor] = useState<Goal | "new" | null>(null);
  const [habitEditor, setHabitEditor] = useState<Habit | "new" | null>(null);
  const [workoutEditor, setWorkoutEditor] = useState<Workout | "new" | null>(null);
  const [applicationEditor, setApplicationEditor] = useState<Application | "new" | null>(null);
  const [noteEditor, setNoteEditor] = useState<Note | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteCategory, setNoteCategory] = useState<NoteCategory>("待办");
  const [noteFilter, setNoteFilter] = useState<"全部" | NoteCategory>("全部");
  const [noteQuery, setNoteQuery] = useState("");
  const [notesMode, setNotesMode] = useState<"backlog" | "ideas">("backlog");
  const [ideaQuery, setIdeaQuery] = useState("");
  const [ideaEditor, setIdeaEditor] = useState<Note | null>(null);
  const [referenceQuery, setReferenceQuery] = useState("");
  const [referenceEditor, setReferenceEditor] = useState<ReferenceNote | null>(null);
  const [referenceCopiedId, setReferenceCopiedId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [taskDropDate, setTaskDropDate] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiPreview, setAiPreview] = useState<AIPlanPreview | null>(null);
  const [aiMessages, setAiMessages] = useState<AIChatMessage[]>([AI_WELCOME_MESSAGE]);
  const [aiModel, setAiModel] = useState<AIModel>("gpt-5.6-luna");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceTarget, setVoiceTarget] = useState<VoiceTarget | null>(null);
  const [draftVoiceError, setDraftVoiceError] = useState("");
  const [ideaVoiceError, setIdeaVoiceError] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [syncMessage, setSyncMessage] = useState("仅保存在这台设备");
  const [filter, setFilter] = useState<"全部" | TaskCategory>("全部");
  const [goalFilter, setGoalFilter] = useState("all");
  const [plannerStatusFilter, setPlannerStatusFilter] = useState<PlannerStatusFilter>("open");
  const [undoNotice, setUndoNotice] = useState<UndoNotice | null>(null);
  const [semesterMode, setSemesterMode] = useState<"calendar" | "week">("week");
  const [semesterWeekOrder, setSemesterWeekOrder] = useState<SemesterWeekModule[]>(DEFAULT_SEMESTER_WEEK_ORDER);
  const [draggedSemesterModule, setDraggedSemesterModule] = useState<SemesterWeekModule | null>(null);
  const [dragOverSemesterModule, setDragOverSemesterModule] = useState<SemesterWeekModule | null>(null);
  const [navOrder, setNavOrder] = useState<View[]>(DEFAULT_NAV_ORDER);
  const [draggedNavView, setDraggedNavView] = useState<View | null>(null);
  const [dragOverNavView, setDragOverNavView] = useState<View | null>(null);
  const [calendarCursor, setCalendarCursor] = useState(() => getTorontoToday().slice(0, 7));
  const [mobileCalendarDate, setMobileCalendarDate] = useState(() => getTorontoToday());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [applicationDateFilter, setApplicationDateFilter] = useState("all");
  const [draggedApplicationId, setDraggedApplicationId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<ApplicationStage | null>(null);
  const [draggedGoalId, setDraggedGoalId] = useState<string | null>(null);
  const [dragOverGoalId, setDragOverGoalId] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<PWAInstallPrompt | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [today, setToday] = useState(() => getTorontoToday());
  const importRef = useRef<HTMLInputElement>(null);
  const noteDraftRef = useRef<HTMLTextAreaElement>(null);
  const ideaDocumentRef = useRef<HTMLTextAreaElement>(null);
  const referenceDocumentRef = useRef<HTMLTextAreaElement>(null);
  const aiConversationRef = useRef<HTMLDivElement>(null);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);
  const aiSessionRef = useRef(0);
  const voiceSessionRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceAbortRef = useRef<AbortController | null>(null);
  const dataRef = useRef<AppData>(initialData);
  const syncRevisionRef = useRef(0);
  const syncBaseRef = useRef<SyncedAppData | null>(null);
  const syncReadyRef = useRef(false);
  const hadLocalDataRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const skipNextSyncRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const referenceCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const todayLabel = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase();
  const phaseTiming = today < data.phase.startDate ? "before" : today > data.phase.endDate ? "after" : "active";
  const phaseStartsIn = Math.max(0, daysBetween(today, data.phase.startDate));
  const phaseEndsIn = Math.max(0, daysBetween(today, data.phase.endDate));
  const phaseDays = phaseTiming === "before" ? phaseStartsIn : phaseEndsIn;
  const phaseDuration = Math.max(1, daysBetween(data.phase.startDate, data.phase.endDate));
  const phaseProgress = Math.max(0, Math.min(100, Math.round((daysBetween(data.phase.startDate, today) / phaseDuration) * 100)));
  const phaseStops = buildPhaseStops(data.phase);
  const phaseCheckpoints = buildPhaseCheckpoints(data.phase);
  const phaseWeeks = Math.max(1, Math.ceil((phaseDuration + 1) / 7));
  const aiVoiceState: VoiceState = voiceTarget === "ai" ? voiceState : "idle";
  const draftVoiceState: VoiceState = voiceTarget === "draft" ? voiceState : "idle";
  const ideaVoiceState: VoiceState = voiceTarget === "idea" ? voiceState : "idle";

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const savedSemesterLayout = window.localStorage.getItem(SEMESTER_LAYOUT_STORAGE_KEY);
    const savedNavOrder = window.localStorage.getItem(NAV_ORDER_STORAGE_KEY);
    const savedSyncMeta = window.localStorage.getItem(SYNC_META_KEY);
    let parsed: Partial<AppData> = {};
    let parsedSemesterLayout: unknown = null;
    let parsedNavOrder: unknown = null;
    if (saved) try { parsed = JSON.parse(saved) as Partial<AppData>; } catch { /* keep safe defaults */ }
    hadLocalDataRef.current = Boolean(saved);
    if (savedSemesterLayout) try { parsedSemesterLayout = JSON.parse(savedSemesterLayout); } catch { /* keep the default module order */ }
    if (savedNavOrder) try { parsedNavOrder = JSON.parse(savedNavOrder); } catch { /* keep the default navigation order */ }
    if (savedSyncMeta) try {
      const meta = JSON.parse(savedSyncMeta) as SyncMeta;
      if (Number.isInteger(meta.revision) && meta.revision >= 0 && meta.baseData) {
        syncRevisionRef.current = meta.revision;
        syncBaseRef.current = meta.baseData;
      }
    } catch { /* start a fresh sync handshake */ }
    const currentDay = getTorontoToday();
    const hydratedData = hydrateAppData(parsed, currentDay);
    // Hydrate device-local state after the server-rendered shell mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(currentDay);
    setSemesterWeekOrder(normalizeSemesterWeekOrder(parsedSemesterLayout));
    setNavOrder(normalizeNavOrder(parsedNavOrder));
    dataRef.current = hydratedData;
    setData(hydratedData);
    syncReadyRef.current = true;
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    dataRef.current = data;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (!syncReadyRef.current) return;
    if (skipNextSyncRef.current) { skipNextSyncRef.current = false; return; }
    window.localStorage.setItem(SYNC_DIRTY_KEY, "1");
    if (!window.navigator.onLine) {
      queueMicrotask(() => {
        setSyncStatus("pending");
        setSyncMessage("离线改动待同步");
      });
      return;
    }
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => { void synchronizeData(); }, 850);
    // synchronizeData reads current refs; recreating the debounce for every render would be incorrect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ready]);

  useEffect(() => {
    if (ready) window.localStorage.setItem(SEMESTER_LAYOUT_STORAGE_KEY, JSON.stringify(semesterWeekOrder));
  }, [ready, semesterWeekOrder]);

  useEffect(() => {
    if (ready) window.localStorage.setItem(NAV_ORDER_STORAGE_KEY, JSON.stringify(navOrder));
  }, [ready, navOrder]);

  useEffect(() => {
    if (view === "notes" && notesMode === "backlog") window.requestAnimationFrame(() => noteDraftRef.current?.focus());
    if (view === "notes" && notesMode === "ideas") window.requestAnimationFrame(() => ideaDocumentRef.current?.focus());
    if (view === "vault") window.requestAnimationFrame(() => referenceDocumentRef.current?.focus());
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view, notesMode]);

  useEffect(() => {
    if (!aiOpen) return;
    window.requestAnimationFrame(() => {
      if (aiConversationRef.current) aiConversationRef.current.scrollTop = aiConversationRef.current.scrollHeight;
    });
  }, [aiMessages, aiLoading, aiOpen, aiPreview]);

  useEffect(() => {
    const refreshDay = () => setToday(getTorontoToday());
    const timer = window.setInterval(refreshDay, 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const task = window.setTimeout(() => {
      if (!online) {
        if (window.localStorage.getItem(SYNC_DIRTY_KEY)) {
          setSyncStatus("pending");
          setSyncMessage("离线改动待同步");
        } else {
          setSyncStatus("local");
          setSyncMessage("离线缓存可用");
        }
        return;
      }
      void synchronizeData();
    }, 0);
    return () => clearTimeout(task);
    // synchronizeData reads the latest refs and deliberately stays outside the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, ready]);

  useEffect(() => {
    if (!ready) return;
    // The Toronto day boundary is an external clock event that resets daily/weekly state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData((current) => {
      const tasks = rollOverTasks(current.tasks, today);
      const currentWeek = getWeekKey(today);
      const resetHabits = current.habitDate !== today;
      const resetWorkouts = current.workoutWeek !== currentWeek;
      if (tasks === current.tasks && !resetHabits && !resetWorkouts) return current;
      return {
        ...current,
        tasks,
        habits: resetHabits ? current.habits.map((habit) => ({ ...habit, done: false })) : current.habits,
        workouts: resetWorkouts ? current.workouts.map((workout) => ({ ...workout, done: false })) : current.workouts,
        habitDate: today,
        workoutWeek: currentWeek,
      };
    });
  }, [ready, today]);

  useEffect(() => {
    // Browser connectivity and standalone display mode are external environment state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(window.navigator.onLine);
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleInstallPrompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as PWAInstallPrompt); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
    };
  }, []);

  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (referenceCopyTimerRef.current) clearTimeout(referenceCopyTimerRef.current);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
  }, []);

  const visibleTasks = useMemo(() => data.tasks.filter((task) => !isCompletedTaskArchived(task, today)), [data.tasks, today]);
  const calendarTasks = useMemo(() => visibleTasks.filter((task) => task.status === "todo"), [visibleTasks]);
  const todayDisplayTasks = useMemo(() => visibleTasks.filter((task) => isTaskVisibleToday(task, today)), [visibleTasks, today]);
  const todayTasks = useMemo(() => todayDisplayTasks.filter((task) => task.status === "todo"), [todayDisplayTasks]);
  const todayRoutineEntries = useMemo(() => data.routines.flatMap((routine) => {
    const entry = routineTodayEntry(routine, today);
    return entry ? [{ routine, ...entry }] : [];
  }).sort((left, right) => (left.routine.time || "99:99").localeCompare(right.routine.time || "99:99")), [data.routines, today]);
  const completedToday = todayDisplayTasks.filter((task) => task.status === "done").length;
  const completedRoutineCount = todayRoutineEntries.filter((entry) => entry.completed).length;
  const openRoutineCount = todayRoutineEntries.length - completedRoutineCount;
  const todayOpenCount = todayTasks.length + openRoutineCount;
  const todayCompletedCount = completedToday + completedRoutineCount;
  const taskProgress = todayOpenCount + todayCompletedCount === 0 ? 0 : Math.round((todayCompletedCount / (todayOpenCount + todayCompletedCount)) * 100);
  const habitDone = data.habits.filter((habit) => habit.done).length;
  const calendarCells = useMemo(() => buildCalendarCells(calendarCursor), [calendarCursor]);
  const weekDays = useMemo(() => buildWeekDays(today), [today]);
  const weekStart = weekDays[0].key;
  const weekEnd = weekDays[6].key;
  const weeklyTasks = calendarTasks.filter((task) => task.date <= weekEnd && (task.endDate || task.date) >= weekStart);
  const weeklyRoutineCount = weekDays.reduce((count, day) => count + data.routines.filter((routine) => isRoutineDueOn(routine, day.key) && !routine.completedDates.includes(day.key)).length, 0);
  const weeklySpanTasks = weeklyTasks.filter(isMultiDayTask).slice().sort((a, b) => a.date.localeCompare(b.date) || (a.endDate || a.date).localeCompare(b.endDate || b.date));
  const calendarMonthLabel = useMemo(() => {
    const [year, month] = calendarCursor.split("-").map(Number);
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
  }, [calendarCursor]);
  const monthStart = `${calendarCursor}-01`;
  const monthEnd = calendarCells.filter((cell) => cell.inMonth).at(-1)?.key || monthStart;
  const monthlySpanTasks = calendarTasks.filter((task) => isMultiDayTask(task) && task.date <= monthEnd && (task.endDate || task.date) >= monthStart).slice().sort((a, b) => a.date.localeCompare(b.date));
  const visibleTaskCount = calendarTasks.filter((task) => task.date <= monthEnd && (task.endDate || task.date) >= monthStart).length;
  const visibleRoutineCount = calendarCells.filter((cell) => cell.inMonth).reduce((count, cell) => count + data.routines.filter((routine) => isRoutineDueOn(routine, cell.key) && !routine.completedDates.includes(cell.key)).length, 0);
  const visibleScheduleCount = calendarCells.filter((cell) => cell.inMonth && cell.key >= data.phase.startDate && cell.key <= data.phase.endDate).reduce((count, cell) => count + data.schedule.filter((item) => item.days.includes(cell.dayCode)).length, 0);
  const mobileCalendarCounts = useMemo(() => new Map(calendarCells.map((cell) => {
    const taskCount = calendarTasks.filter((task) => task.date <= cell.key && (task.endDate || task.date) >= cell.key).length;
    const routineCount = data.routines.filter((routine) => isRoutineDueOn(routine, cell.key) && !routine.completedDates.includes(cell.key)).length;
    const scheduleCount = cell.key >= data.phase.startDate && cell.key <= data.phase.endDate ? data.schedule.filter((item) => item.days.includes(cell.dayCode)).length : 0;
    return [cell.key, { taskCount, routineCount, scheduleCount, total: taskCount + routineCount + scheduleCount }];
  })), [calendarCells, calendarTasks, data.phase.endDate, data.phase.startDate, data.routines, data.schedule]);
  const mobileSelectedCell = calendarCells.find((cell) => cell.key === mobileCalendarDate) || calendarCells.find((cell) => cell.inMonth) || calendarCells[0];
  const mobileSelectedTasks = calendarTasks.filter((task) => task.date <= mobileCalendarDate && (task.endDate || task.date) >= mobileCalendarDate).slice().sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  const mobileSelectedRoutines = data.routines.filter((routine) => isRoutineDueOn(routine, mobileCalendarDate) && !routine.completedDates.includes(mobileCalendarDate)).slice().sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  const mobileSelectedSchedules = mobileSelectedCell && mobileCalendarDate >= data.phase.startDate && mobileCalendarDate <= data.phase.endDate ? data.schedule.filter((item) => item.days.includes(mobileSelectedCell.dayCode)).slice().sort((a, b) => a.start.localeCompare(b.start)) : [];
  const applicationDateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const application of data.applications) if (application.date) counts.set(application.date, (counts.get(application.date) || 0) + 1);
    return [...counts.entries()].sort(([left], [right]) => right.localeCompare(left));
  }, [data.applications]);
  const visibleApplications = applicationDateFilter === "all" ? data.applications : data.applications.filter((application) => application.date === applicationDateFilter);
  const upcomingTask = useMemo(() => visibleTasks.filter((task) => task.status === "todo" && task.date > today).slice().sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99:99").localeCompare(b.time || "99:99"))[0] || null, [visibleTasks, today]);
  const upcomingDate = upcomingTask ? dateCardParts(upcomingTask.date) : null;
  const courseCount = useMemo(() => new Set(data.schedule.filter((item) => item.kind === "课程").map((item) => item.code)).size, [data.schedule]);
  const taCount = data.schedule.filter((item) => item.kind === "TA").length;
  const statusFilteredTasks = useMemo(() => visibleTasks.filter((task) => plannerStatusFilter === "all" || (plannerStatusFilter === "done" ? task.status === "done" : task.status === "todo")), [visibleTasks, plannerStatusFilter]);
  const plannerTasks = useMemo(() => statusFilteredTasks.filter((task) => (filter === "全部" || task.category === filter) && (goalFilter === "all" || (goalFilter === "none" ? !task.goalId : task.goalId === goalFilter))).slice().sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.date.localeCompare(b.date) || (a.time || "99:99").localeCompare(b.time || "99:99")), [statusFilteredTasks, filter, goalFilter]);
  const goalById = useMemo(() => new Map(data.goals.map((goal) => [goal.id, goal])), [data.goals]);
  const goalTaskStats = useMemo(() => new Map(data.goals.map((goal) => {
    const tasks = data.tasks.filter((task) => task.goalId === goal.id);
    return [goal.id, { open: tasks.filter((task) => task.status === "todo").length, done: tasks.filter((task) => task.status === "done").length }];
  })), [data.goals, data.tasks]);
  const visibleNotes = useMemo(() => {
    const query = noteQuery.trim().toLocaleLowerCase();
    return data.notes.filter((note) => note.category !== "想法" && (noteFilter === "全部" || note.category === noteFilter) && (!query || note.content.toLocaleLowerCase().includes(query) || note.category.toLocaleLowerCase().includes(query))).slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  }, [data.notes, noteFilter, noteQuery]);
  const backlogNotes = useMemo(() => data.notes.filter((note) => note.category !== "想法"), [data.notes]);
  const ideaNotes = useMemo(() => {
    const query = ideaQuery.trim().toLocaleLowerCase();
    return data.notes.filter((note) => note.category === "想法" && (!query || note.content.toLocaleLowerCase().includes(query))).slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  }, [data.notes, ideaQuery]);
  const backlogCount = backlogNotes.length;
  const visibleReferences = useMemo(() => {
    const query = referenceQuery.trim().toLocaleLowerCase();
    return data.references.filter((reference) => !query || reference.title.toLocaleLowerCase().includes(query) || reference.content.toLocaleLowerCase().includes(query)).slice().sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt.localeCompare(left.updatedAt));
  }, [data.references, referenceQuery]);
  const mobileViewTitle: Record<View, string> = { today: "今天", goals: "长期目标", semester: "阶段地图", career: "求职记录", planner: "任务计划", notes: "草稿箱", vault: "私人速记", meals: "饮食计划", wellness: "健身与健康" };

  function openNewTask(date?: string, goalId?: string) {
    setNewTaskDate(date || null);
    setNewTaskGoalId(goalId || null);
    setTaskPrefill(null);
    setPromotingNoteId(null);
    setTaskEditor("new");
  }

  function moveCalendar(distance: number) {
    const next = moveMonth(calendarCursor, distance);
    setCalendarCursor(next);
    setMobileCalendarDate(`${next}-01`);
  }

  function moveCalendarToToday() {
    setCalendarCursor(today.slice(0, 7));
    setMobileCalendarDate(today);
  }

  function promoteNoteToTask(note: Note) {
    const preview = notePreview(note);
    setTaskPrefill({ title: noteTitle(note), details: preview === noteTitle(note) ? "" : preview, category: taskCategoryFromNote(note.category) });
    setPromotingNoteId(note.id);
    setNewTaskDate(today);
    setNewTaskGoalId(null);
    setTaskEditor("new");
  }

  function closeTaskEditor() {
    setTaskEditor(null);
    setNewTaskDate(null);
    setNewTaskGoalId(null);
    setTaskPrefill(null);
    setPromotingNoteId(null);
  }

  function saveTaskFromEditor(task: Task) {
    const sourceNote = promotingNoteId ? data.notes.find((note) => note.id === promotingNoteId) : null;
    const sourceIndex = sourceNote ? data.notes.findIndex((note) => note.id === sourceNote.id) : -1;
    setData((current) => {
      const tasks = taskEditor === "new" ? [...current.tasks, task] : current.tasks.map((item) => item.id === task.id ? task : item);
      const notes = sourceNote ? current.notes.filter((note) => note.id !== sourceNote.id) : current.notes;
      return { ...current, notes, tasks: rollOverTasks(tasks, today) };
    });
    if (sourceNote) showUndo(`已将草稿「${noteTitle(sourceNote)}」安排为任务`, (current) => {
      const notes = current.notes.some((note) => note.id === sourceNote.id) ? current.notes : [...current.notes.slice(0, Math.max(0, sourceIndex)), sourceNote, ...current.notes.slice(Math.max(0, sourceIndex))];
      return { ...current, notes, tasks: current.tasks.filter((item) => item.id !== task.id) };
    });
    closeTaskEditor();
  }

  function openNotes() {
    setView("notes");
    window.requestAnimationFrame(() => notesMode === "ideas" ? ideaDocumentRef.current?.focus() : noteDraftRef.current?.focus());
  }

  function saveQuickNote() {
    const content = noteDraft.trim();
    if (!content) return;
    const now = new Date().toISOString();
    setData((current) => ({ ...current, notes: [{ id: uid(), content, category: noteCategory, pinned: false, createdAt: now, updatedAt: now }, ...current.notes] }));
    setNoteDraft("");
    window.requestAnimationFrame(() => noteDraftRef.current?.focus());
  }

  function openIdeaNotes() {
    setNotesMode("ideas");
    if (!ideaEditor && ideaNotes[0] && !window.matchMedia("(max-width: 760px)").matches) setIdeaEditor(ideaNotes[0]);
    window.requestAnimationFrame(() => ideaDocumentRef.current?.focus());
  }

  function createIdeaNote() {
    const now = new Date().toISOString();
    const note: Note = { id: uid(), content: "", category: "想法", pinned: false, createdAt: now, updatedAt: now };
    setData((current) => ({ ...current, notes: [note, ...current.notes] }));
    setIdeaEditor(note);
    setNotesMode("ideas");
    window.requestAnimationFrame(() => ideaDocumentRef.current?.focus());
  }

  function openIdeaOrganizerAI(note: Note) {
    setAiOpen(true);
    setAiText(`请帮我整理灵感笔记「${noteTitle(note)}」。保留原意和具体信息，改善结构与表达；修改前先给我预览。`);
    window.requestAnimationFrame(() => aiInputRef.current?.focus());
  }

  function updateIdeaNote(note: Note, patch: Partial<Note>) {
    const next: Note = { ...note, ...patch, category: "想法", updatedAt: new Date().toISOString() };
    setIdeaEditor(next);
    setData((current) => ({ ...current, notes: current.notes.map((item) => item.id === note.id ? next : item) }));
  }

  function deleteIdeaNote(note: Note) {
    removeRecord("notes", note.id, `已删除灵感「${noteTitle(note)}」`);
    setIdeaEditor(null);
  }

  function openVault() {
    setView("vault");
    if (window.matchMedia("(max-width: 760px)").matches) {
      setReferenceEditor(null);
      return;
    }
    const selected = referenceEditor || visibleReferences[0] || null;
    if (selected && !referenceEditor) setReferenceEditor(selected);
    if (selected) window.requestAnimationFrame(() => referenceDocumentRef.current?.focus());
  }

  function createReference() {
    const now = new Date().toISOString();
    const reference: ReferenceNote = { id: uid(), title: "无标题速记", content: "", pinned: false, aiExcluded: true, createdAt: now, updatedAt: now };
    setData((current) => ({ ...current, references: [reference, ...current.references] }));
    setReferenceEditor(reference);
    window.requestAnimationFrame(() => referenceDocumentRef.current?.focus());
  }

  function updateReference(reference: ReferenceNote, patch: Partial<ReferenceNote>) {
    const next = { ...reference, ...patch, updatedAt: new Date().toISOString() };
    setReferenceEditor(next);
    setData((current) => ({ ...current, references: current.references.map((item) => item.id === reference.id ? next : item) }));
  }

  function deleteReference(reference: ReferenceNote) {
    removeRecord("references", reference.id, `已删除资料「${reference.title}」`);
    setReferenceEditor(null);
  }

  function toggleReferencePin(reference: ReferenceNote) {
    const next = { ...reference, pinned: !reference.pinned, updatedAt: new Date().toISOString() };
    setData((current) => ({ ...current, references: current.references.map((item) => item.id === reference.id ? next : item) }));
    if (referenceEditor?.id === reference.id) setReferenceEditor(next);
  }

  async function copyReference(reference: ReferenceNote) {
    try {
      await navigator.clipboard.writeText(reference.content);
      setReferenceCopiedId(reference.id);
      if (referenceCopyTimerRef.current) clearTimeout(referenceCopyTimerRef.current);
      referenceCopyTimerRef.current = setTimeout(() => setReferenceCopiedId(null), 1800);
    } catch {
      window.alert("浏览器阻止了复制，请打开资料后手动复制。");
    }
  }

  function openReferenceOrganizerAI() {
    setAiOpen(true);
    setAiText("请把我接下来主动粘贴、愿意发送给 AI 的杂乱备忘录整理进私人速记。按主题拆成少量独立笔记页面，保留我明确提供的原文和值，先给我预览：\n");
    window.requestAnimationFrame(() => aiInputRef.current?.focus());
  }

  function saveRoutine(routine: Routine) {
    setData((current) => ({ ...current, routines: normalizeRoutines(routineEditor === "new" ? [...current.routines, routine] : current.routines.map((item) => item.id === routine.id ? routine : item), current.goals) }));
    setRoutineEditor(null);
  }

  function toggleRoutineCompletion(id: string, occurrenceDate: string) {
    setData((current) => ({ ...current, routines: current.routines.map((routine) => {
      if (routine.id !== id) return routine;
      const completed = routine.completedDates.includes(occurrenceDate);
      return { ...routine, completedDates: completed ? routine.completedDates.filter((date) => date !== occurrenceDate) : [...routine.completedDates, occurrenceDate].sort() };
    }) }));
  }

  function toggleRoutineActive(id: string) {
    setData((current) => ({ ...current, routines: current.routines.map((routine) => routine.id === id ? { ...routine, active: !routine.active } : routine) }));
  }

  function deleteRoutine(id: string) {
    const routine = data.routines.find((item) => item.id === id);
    removeRecord("routines", id, routine ? `已删除固定任务「${routine.title}」` : "已删除固定任务");
  }

  function toggleTask(id: string) {
    setData((current) => ({ ...current, tasks: rollOverTasks(current.tasks.map((task) => task.id === id ? { ...task, status: task.status === "done" ? "todo" as const : "done" as const, completedAt: task.status === "done" ? null : today } : task), today) }));
  }

  function beginTaskDrag(event: React.DragEvent<HTMLElement>, task: Task) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-map-task", task.id);
    event.dataTransfer.setData("text/plain", task.id);
    setDraggedTaskId(task.id);
  }

  function endTaskDrag() {
    setDraggedTaskId(null);
    setTaskDropDate(null);
  }

  function allowTaskDrop(event: React.DragEvent<HTMLElement>, date: string) {
    if (!draggedTaskId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (taskDropDate !== date) setTaskDropDate(date);
  }

  function dropTaskOnDate(event: React.DragEvent<HTMLElement>, date: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData("application/x-map-task") || draggedTaskId;
    const task = data.tasks.find((item) => item.id === id);
    endTaskDrag();
    if (!task || task.date === date) return;
    const shifted = shiftTaskToDate(task, date) as Task;
    setData((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? shifted : item) }));
    showUndo(`已将「${task.title}」改到 ${formatDate(date)}`, (current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? task : item) }));
  }

  function deleteTask(id: string) {
    const task = data.tasks.find((item) => item.id === id);
    removeRecord("tasks", id, task ? `已删除任务「${task.title}」` : "已删除任务");
  }

  function showUndo(message: string, restore: (current: AppData) => AppData) {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoNotice({ message, restore });
    undoTimerRef.current = setTimeout(() => setUndoNotice(null), 7000);
  }

  function removeRecord<K extends RecordCollection>(collection: K, id: string, message: string) {
    const list = data[collection] as unknown as Array<{ id: string }>;
    const index = list.findIndex((item) => item.id === id);
    if (index < 0) return;
    const record = list[index];
    setData((current) => ({ ...current, [collection]: (current[collection] as unknown as Array<{ id: string }>).filter((item) => item.id !== id) }) as AppData);
    showUndo(message, (current) => {
      const currentList = current[collection] as unknown as Array<{ id: string }>;
      if (currentList.some((item) => item.id === id)) return current;
      const restored = [...currentList];
      restored.splice(Math.min(index, restored.length), 0, record);
      return { ...current, [collection]: restored } as AppData;
    });
  }

  function undoLastAction() {
    if (!undoNotice) return;
    setData((current) => undoNotice.restore(current));
    setUndoNotice(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
  }

  function moveApplication(id: string, stage: ApplicationStage) {
    setData((current) => ({ ...current, applications: current.applications.map((application) => application.id === id ? { ...application, stage } : application) }));
  }

  function moveGoal(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    setData((current) => {
      const goals = [...current.goals];
      const sourceIndex = goals.findIndex((goal) => goal.id === sourceId);
      const targetIndex = goals.findIndex((goal) => goal.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const [moved] = goals.splice(sourceIndex, 1);
      goals.splice(targetIndex, 0, moved);
      return { ...current, goals };
    });
  }

  function moveGoalByOffset(id: string, offset: number) {
    setData((current) => {
      const goals = [...current.goals];
      const sourceIndex = goals.findIndex((goal) => goal.id === id);
      const targetIndex = Math.max(0, Math.min(goals.length - 1, sourceIndex + offset));
      if (sourceIndex < 0 || sourceIndex === targetIndex) return current;
      const [moved] = goals.splice(sourceIndex, 1);
      goals.splice(targetIndex, 0, moved);
      return { ...current, goals };
    });
  }

  function moveSemesterModule(source: SemesterWeekModule, target: SemesterWeekModule) {
    if (source === target) return;
    setSemesterWeekOrder((current) => {
      const targetIndex = current.indexOf(target);
      if (targetIndex < 0 || !current.includes(source)) return current;
      const next = current.filter((module) => module !== source);
      next.splice(targetIndex, 0, source);
      return next;
    });
  }

  function moveNavigationItem(source: View, target: View) {
    if (source === target) return;
    setNavOrder((current) => {
      const targetIndex = current.indexOf(target);
      if (targetIndex < 0 || !current.includes(source)) return current;
      const next = current.filter((item) => item !== source);
      next.splice(targetIndex, 0, source);
      return next;
    });
  }

  function openNavigationView(target: View) {
    if (target === "notes") openNotes();
    else if (target === "vault") openVault();
    else setView(target);
  }

  function deleteGoal(id: string) {
    const goal = data.goals.find((item) => item.id === id);
    if (!goal) return;
    const index = data.goals.findIndex((item) => item.id === id);
    const linkedTaskIds = new Set(data.tasks.filter((task) => task.goalId === id).map((task) => task.id));
    const phaseWasLinked = data.phase.goalId === id;
    setData((current) => ({
      ...current,
      phase: current.phase.goalId === id ? { ...current.phase, goalId: null } : current.phase,
      goals: current.goals.filter((item) => item.id !== id),
      tasks: current.tasks.map((task) => task.goalId === id ? { ...task, goalId: null } : task),
    }));
    showUndo(`已删除目标「${goal.title}」并解除任务关联`, (current) => {
      if (current.goals.some((item) => item.id === id)) return current;
      const goals = [...current.goals];
      goals.splice(Math.min(index, goals.length), 0, goal);
      return { ...current, phase: phaseWasLinked && !current.phase.goalId ? { ...current.phase, goalId: id } : current.phase, goals, tasks: current.tasks.map((task) => linkedTaskIds.has(task.id) && !task.goalId ? { ...task, goalId: id } : task) };
    });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "map-life-backup.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function importData(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppData;
        if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.schedule) || !Array.isArray(parsed.goals)) throw new Error("invalid backup");
        const previous = data;
        const importedGoals = parsed.goals || initialData.goals;
        const importedPhase = { ...initialData.phase, ...(parsed.phase || {}) };
        if (importedPhase.goalId && !importedGoals.some((goal) => goal.id === importedPhase.goalId)) importedPhase.goalId = null;
        setData({ ...initialData, ...parsed, phase: importedPhase, goals: importedGoals, tasks: normalizeTaskGoals(rollOverTasks(parsed.tasks, today), importedGoals), routines: normalizeRoutines(parsed.routines || initialData.routines, importedGoals), schedule: normalizeSchedule(parsed.schedule), applications: normalizeApplications(parsed.applications), notes: parsed.notes || [], references: normalizeReferences(parsed.references) });
        showUndo("备份已导入", () => previous);
      } catch { window.alert("这个文件不是有效的 MAP 备份，当前数据没有改变。"); }
    };
    reader.readAsText(file);
  }

  function rememberSync(revision: number, baseData: SyncedAppData) {
    syncRevisionRef.current = revision;
    syncBaseRef.current = baseData;
    window.localStorage.setItem(SYNC_META_KEY, JSON.stringify({ revision, baseData } satisfies SyncMeta));
  }

  async function readSyncState(): Promise<SyncEnvelope> {
    const response = await fetch("/api/sync", { method: "GET", cache: "no-store" });
    const result = await response.json() as SyncEnvelope;
    if (!response.ok) throw new Error(result.error || "暂时无法读取云端计划。");
    return result;
  }

  async function writeSyncState(dataToSave: SyncedAppData, baseRevision: number) {
    const response = await fetch("/api/sync", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseRevision, data: dataToSave }) });
    const result = await response.json() as SyncEnvelope;
    return { response, result };
  }

  async function synchronizeData() {
    if (syncInFlightRef.current || typeof window === "undefined" || !window.navigator.onLine) return;
    syncInFlightRef.current = true;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = null;
    setSyncStatus("syncing");
    setSyncMessage("正在同步…");

    try {
      let server = await readSyncState();
      const localAtMerge = toSyncPayload(dataRef.current) as SyncedAppData;
      let desired = localAtMerge;
      let conflicts = 0;

      if (server.initialized && server.data) {
        if (syncBaseRef.current) {
          const merged = mergeSyncPayload(syncBaseRef.current, localAtMerge, server.data) as { data: SyncedAppData; conflicts: number };
          desired = merged.data;
          conflicts += merged.conflicts;
        } else if (hadLocalDataRef.current) {
          const merged = mergeSyncPayload(toSyncPayload(initialData), localAtMerge, server.data) as { data: SyncedAppData; conflicts: number };
          desired = merged.data;
          conflicts += merged.conflicts;
        } else {
          desired = server.data;
        }
      }

      if (!server.initialized || !server.data || !syncPayloadEquals(desired, server.data)) {
        let write = await writeSyncState(desired, server.revision);
        if (write.response.status === 409 && write.result.initialized && write.result.data) {
          const retryMerge = mergeSyncPayload(server.data, desired, write.result.data) as { data: SyncedAppData; conflicts: number };
          desired = retryMerge.data;
          conflicts += retryMerge.conflicts;
          write = await writeSyncState(desired, write.result.revision);
        }
        if (!write.response.ok || !write.result.data) throw new Error(write.result.error || "暂时无法写入云端计划。");
        server = write.result;
      }

      const latestLocal = toSyncPayload(dataRef.current) as SyncedAppData;
      let nextPayload = desired;
      let hasFollowUpChanges = false;
      if (!syncPayloadEquals(latestLocal, localAtMerge)) {
        const liveMerge = mergeSyncPayload(localAtMerge, latestLocal, desired) as { data: SyncedAppData; conflicts: number };
        nextPayload = liveMerge.data;
        conflicts += liveMerge.conflicts;
        hasFollowUpChanges = !syncPayloadEquals(nextPayload, server.data);
      }

      rememberSync(server.revision, server.data || desired);
      const mergedReferences = mergeDeviceAndCloudReferences(dataRef.current.references, nextPayload.references);
      const nextData = hydrateAppData({ ...nextPayload, references: mergedReferences }, getTorontoToday(), mergedReferences);
      if (!syncPayloadEquals(toSyncPayload(dataRef.current), nextPayload)) {
        skipNextSyncRef.current = !hasFollowUpChanges;
        dataRef.current = nextData;
        setData(nextData);
      }

      if (hasFollowUpChanges) {
        window.localStorage.setItem(SYNC_DIRTY_KEY, "1");
        setSyncStatus("pending");
        setSyncMessage("新改动待同步");
      } else {
        window.localStorage.removeItem(SYNC_DIRTY_KEY);
        setSyncStatus(conflicts ? "conflict" : "synced");
        setSyncMessage(conflicts ? `已合并 · ${conflicts} 处冲突采用本机版本` : "已同步到所有设备");
      }
    } catch (error) {
      window.localStorage.setItem(SYNC_DIRTY_KEY, "1");
      setSyncStatus("error");
      setSyncMessage(error instanceof Error ? error.message : "同步暂时不可用");
    } finally {
      syncInFlightRef.current = false;
    }
  }

  async function installMapApp() {
    if (!installPrompt) { setInstallHelp(true); return; }
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setInstallPrompt(null);
  }

  function releaseVoiceResources() {
    if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
    voiceTimeoutRef.current = null;
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
    mediaRecorderRef.current = null;
  }

  async function toggleVoiceInput(target: VoiceTarget = "ai") {
    if (voiceState === "recording") {
      if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
      return;
    }
    if (voiceState !== "idle" || (target === "ai" && aiLoading) || !online) return;
    const showVoiceError = (message: string) => target === "ai" ? setAiError(message) : target === "idea" ? setIdeaVoiceError(message) : setDraftVoiceError(message);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      showVoiceError("这个浏览器不支持直接录音，请使用最新版 Chrome 或 Safari。");
      return;
    }

    const session = ++voiceSessionRef.current;
    setVoiceTarget(target);
    if (target === "ai") setAiError("");
    else if (target === "idea") setIdeaVoiceError("");
    else setDraftVoiceError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== voiceSessionRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      voiceStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) voiceChunksRef.current.push(event.data); };
      recorder.onerror = () => {
        if (session === voiceSessionRef.current) showVoiceError("录音失败，请重新允许麦克风权限后再试。");
        releaseVoiceResources();
        setVoiceState("idle");
        setVoiceTarget(null);
      };
      recorder.onstop = async () => {
        const chunks = voiceChunksRef.current;
        const recordedType = recorder.mimeType || mimeType || "audio/webm";
        releaseVoiceResources();
        if (session !== voiceSessionRef.current) return;
        const audio = new Blob(chunks, { type: recordedType });
        if (!audio.size) { showVoiceError("没有录到声音，请再试一次。"); setVoiceState("idle"); setVoiceTarget(null); return; }
        setVoiceState("transcribing");
        const controller = new AbortController();
        voiceAbortRef.current = controller;
        try {
          const form = new FormData();
          form.append("audio", audio, recordedType.includes("mp4") ? "map-voice.mp4" : "map-voice.webm");
          form.append("mode", target === "idea" ? "idea" : target === "draft" ? "backlog" : "plain");
          const response = await fetch("/api/transcribe", { method: "POST", body: form, signal: controller.signal });
          const result = await response.json() as { text?: string; error?: string; warning?: string; polished?: boolean };
          if (!response.ok || !result.text) throw new Error(result.error || "语音暂时无法转写。");
          if (session !== voiceSessionRef.current) return;
          if (target === "draft") {
            setNoteDraft((current) => `${current}${current.trim() ? "\n" : ""}${result.text}`);
            if (result.warning) setDraftVoiceError(result.warning);
            window.requestAnimationFrame(() => noteDraftRef.current?.focus());
          } else if (target === "idea") {
            const targetId = ideaEditor?.id;
            if (targetId) {
              setData((current) => ({ ...current, notes: current.notes.map((note) => note.id === targetId ? { ...note, content: `${note.content}${note.content.trim() ? "\n\n" : ""}${result.text}`, updatedAt: new Date().toISOString() } : note) }));
              setIdeaEditor((current) => current?.id === targetId ? { ...current, content: `${current.content}${current.content.trim() ? "\n\n" : ""}${result.text}`, updatedAt: new Date().toISOString() } : current);
              if (result.warning) setIdeaVoiceError(result.warning);
              window.requestAnimationFrame(() => ideaDocumentRef.current?.focus());
            }
          } else {
            setAiText((current) => `${current}${current.trim() ? "\n" : ""}${result.text}`);
            window.requestAnimationFrame(() => aiInputRef.current?.focus());
          }
        } catch (error) {
          if (session === voiceSessionRef.current && !(error instanceof DOMException && error.name === "AbortError")) showVoiceError(error instanceof Error ? error.message : "语音暂时无法转写。");
        } finally {
          if (session === voiceSessionRef.current) { setVoiceState("idle"); setVoiceTarget(null); }
          if (voiceAbortRef.current === controller) voiceAbortRef.current = null;
        }
      };
      recorder.start();
      setVoiceState("recording");
      voiceTimeoutRef.current = setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, 120000);
    } catch (error) {
      releaseVoiceResources();
      setVoiceState("idle");
      setVoiceTarget(null);
      showVoiceError(error instanceof DOMException && error.name === "NotAllowedError" ? "需要允许麦克风权限才能使用语音输入。" : "无法启动麦克风，请检查浏览器权限。");
    }
  }

  function closeAIChat() {
    aiSessionRef.current += 1;
    if (voiceTarget === "ai") {
      voiceSessionRef.current += 1;
      voiceAbortRef.current?.abort();
      voiceAbortRef.current = null;
      if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
      releaseVoiceResources();
      setVoiceState("idle");
      setVoiceTarget(null);
    }
    setAiOpen(false);
    setAiText("");
    setAiLoading(false);
    setAiError("");
    setAiPreview(null);
    setAiMessages([AI_WELCOME_MESSAGE]);
  }

  function toggleAIChat() {
    if (aiOpen) { closeAIChat(); return; }
    setAiOpen(true);
    window.requestAnimationFrame(() => aiInputRef.current?.focus());
  }

  function openJobCaptureAI() {
    setAiOpen(true);
    setAiText("请把我接下来粘贴的职位信息加入求职看板：\n");
    window.requestAnimationFrame(() => aiInputRef.current?.focus());
  }

  async function sendAIMessage(text = aiText) {
    const content = text.trim();
    if (!content || aiLoading || voiceState !== "idle") return;
    if (!online) { setAiError("当前处于离线模式。MAP 的其他功能仍可使用，恢复网络后再继续对话。"); return; }
    const userMessage: AIChatMessage = { id: uid(), role: "user", content };
    const nextMessages = [...aiMessages, userMessage];
    const session = aiSessionRef.current;
    setAiMessages(nextMessages);
    setAiText("");
    setAiLoading(true);
    setAiError("");
    setAiPreview(null);
    try {
      const aiReadableData = { ...data, references: data.references.filter((reference) => reference.aiExcluded === false) };
      const response = await fetch("/api/ai-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: nextMessages.map(({ role, content: messageContent }) => ({ role, content: messageContent })), currentData: aiReadableData, today, model: aiModel }) });
      const result = await response.json() as AIChatResponse;
      if (!response.ok) throw new Error(result.error || "MAP AI 暂时无法回复。");
      if (typeof result.reply !== "string" || !Array.isArray(result.operations)) throw new Error("AI 返回的数据格式不完整，请再试一次。");
      if (session !== aiSessionRef.current) return;
      setAiMessages((current) => [...current, { id: uid(), role: "assistant", content: result.reply }]);
      if (result.action === "proposal") {
        const operatedData = applyAIOperations(data, result.operations, () => `ai-${uid()}`) as AppData;
        const nextData = {
          ...operatedData,
          phase: operatedData.phase.goalId && !operatedData.goals.some((goal) => goal.id === operatedData.phase.goalId) ? { ...operatedData.phase, goalId: null } : operatedData.phase,
          tasks: normalizeTaskGoals(operatedData.tasks, operatedData.goals),
          routines: normalizeRoutines(operatedData.routines, operatedData.goals),
          schedule: normalizeSchedule(operatedData.schedule),
          applications: normalizeApplications(operatedData.applications),
          references: normalizeReferences(operatedData.references),
        };
        const changes = deriveAIChanges(data, nextData);
        if (changes.length === 1 && changes[0] === "没有检测到实际数据变化。") throw new Error("AI 没有生成有效的数据修改，请换一种说法再试。 ");
        setAiPreview({ summary: result.summary || "应用本次修改", changes, nextData });
      }
    } catch (error) {
      if (session !== aiSessionRef.current) return;
      setAiError(error instanceof Error ? error.message : "MAP AI 暂时无法回复。");
    } finally {
      if (session === aiSessionRef.current) setAiLoading(false);
    }
  }

  function applyAIPlan() {
    if (!aiPreview) return;
    setData({ ...aiPreview.nextData, tasks: rollOverTasks(aiPreview.nextData.tasks, today), habitDate: today, workoutWeek: getWeekKey(today) });
    setAiMessages((current) => [...current, { id: uid(), role: "assistant", content: `已经应用：${aiPreview.summary}` }]);
    setAiPreview(null);
    setAiError("");
  }

  return (
    <main className="app-shell">
      {!online && <div className="offline-banner"><strong>离线模式</strong><span>仍可编辑，联网后自动同步；AI 与语音暂停。</span></div>}
      {undoNotice && <div className="undo-toast" role="status"><span>{undoNotice.message}</span><button onClick={undoLastAction}>撤销</button></div>}
      <aside className="sidebar">
        <button className="brand" onClick={() => openNavigationView(navOrder[0] ?? "today")} aria-label={`打开置顶模块：${NAV_LABELS[navOrder[0] ?? "today"]}`}>
          <span className="brand-mark">M</span>
          <span><strong>MAP</strong><small>Life operating system</small></span>
        </button>

        <nav aria-label="主导航">
          {navOrder.map((item, index) => <NavButton
            key={item}
            active={view === item}
            label={NAV_LABELS[item]}
            icon={String(index + 1).padStart(2, "0")}
            dragging={draggedNavView === item}
            dragOver={dragOverNavView === item}
            onClick={() => openNavigationView(item)}
            onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item); setDraggedNavView(item); }}
            onDragOver={(event) => { if (!draggedNavView) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverNavView(item); }}
            onDrop={(event) => { event.preventDefault(); if (draggedNavView) moveNavigationItem(draggedNavView, item); setDraggedNavView(null); setDragOverNavView(null); }}
            onDragEnd={() => { setDraggedNavView(null); setDragOverNavView(null); }}
          />)}
        </nav>

        <div className="sidebar-spacer" />
        <button className="semester-card" onClick={() => setPhaseEditor(true)} aria-label="编辑当前阶段">
          <div className="semester-card-top"><span>{data.phase.label}</span><strong>{phaseProgress}%</strong></div>
          <div className="progress-track"><span style={{ width: `${phaseProgress}%` }} /></div>
          <p>{data.phase.title} · {formatDate(data.phase.startDate)}—{formatDate(data.phase.endDate)}</p>
          <small>{phaseTiming === "before" ? `${phaseDays} 天后开始` : phaseTiming === "active" ? `距离「${data.phase.outcome}」还有 ${phaseDays} 天` : "阶段已结束 · 点击设置下一阶段"}</small>
          <i>点击编辑当前阶段 →</i>
        </button>
        <div className="data-tools">
          <button onClick={exportData}>导出备份</button>
          <button onClick={() => importRef.current?.click()}>导入</button>
          <input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => { importData(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        </div>
        {!standalone && <button className="install-app-button" onClick={installMapApp}><span>↓</span><div><strong>安装 MAP App</strong><small>独立窗口 · 支持离线</small></div></button>}
        <button className={`sync-note ${syncStatus}`} onClick={() => void synchronizeData()} disabled={!online || syncStatus === "syncing"} title={syncMessage}><span /><div><strong>{syncMessage}</strong><small>只同步已授权的私人速记</small></div></button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{todayLabel}</p>
            <h1 className="desktop-page-title">{view === "today" ? "今天，先把最重要的事情往前推。" : view === "goals" ? "把想要的人生变成可执行路线。" : view === "semester" ? "看清当前阶段的时间与节奏。" : view === "career" ? "只投值得换掉保底的机会。" : view === "planner" ? "所有待办，一个出口。" : view === "notes" ? "没准备好排期的，先放进草稿箱。" : view === "vault" ? "零散资料，随手记下，一秒找到。" : view === "meals" ? "提前决定吃什么，把精力留给生活。" : "健康不是剩余时间。"}</h1>
            <div className="mobile-page-title"><small>MAP</small><strong>{mobileViewTitle[view]}</strong></div>
          </div>
          <div className="topbar-actions"><button className="quick-vault-top" onClick={openVault}><span>⌁</span> 私人速记</button><button className="quick-note-top" onClick={openNotes}><span>✎</span> 记草稿</button><button className="primary-button" onClick={() => openNewTask()}><span>＋</span> 新建任务</button></div>
        </header>

        {view === "today" && (
          <div className="page-content">
            <section className="countdown-hero">
              <div className="countdown-copy">
                <p className="section-kicker">CURRENT PHASE · {data.phase.label}</p>
                <h2 className={phaseTiming === "before" ? "phase-countdown-display" : undefined}>{phaseTiming === "before" ? <><span className="phase-countdown-item"><strong>{phaseStartsIn}</strong><small>天后开始</small></span><span className="phase-countdown-item"><strong>{phaseEndsIn}</strong><small>天后结束</small></span></> : phaseTiming === "active" ? <><span>{phaseEndsIn}</span> 天后结束</> : <>设置你的<br />下一阶段</>}</h2>
                <p>{data.phase.description}</p>
                <button className="text-link" onClick={() => phaseTiming === "after" ? setPhaseEditor(true) : setView("semester")}>{phaseTiming === "after" ? "设置新的当前阶段" : "查看完整阶段地图"} <span>→</span></button>
              </div>
              <div className="route-graphic" aria-label={`${data.phase.title}阶段路线`}>
                <div className="route-line" />
                {phaseStops.map((label, index) => (
                  <div className={`route-stop stop-${index}`} key={label}><i>{index === 0 ? "●" : index === 4 ? "★" : ""}</i><span>{label}</span></div>
                ))}
                <div className="route-note note-one">{formatDate(data.phase.startDate)} 启动</div>
                <div className="route-note note-two">{formatDate(data.phase.endDate)} 完成</div>
              </div>
            </section>

            <div className="dashboard-grid">
              <section className="panel today-panel">
                <div className="panel-heading">
                  <div><p className="section-kicker">TODAY</p><h3>今天要清掉的事</h3></div>
                  <span className="counter">{todayOpenCount} 未完成</span>
                </div>
                <div className="today-progress"><span style={{ width: `${taskProgress}%` }} /></div>
                <div className="task-stack">
                  {todayRoutineEntries.map(({ routine, occurrenceDate, completed, overdue }) => <RoutineTodayRow key={`${routine.id}-${occurrenceDate}`} routine={routine} occurrenceDate={occurrenceDate} completed={completed} overdue={overdue} goal={routine.goalId ? goalById.get(routine.goalId) : undefined} onToggle={() => toggleRoutineCompletion(routine.id, occurrenceDate)} onEdit={() => setRoutineEditor(routine)} />)}
                  {todayDisplayTasks.slice().sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")).map((task) => (
                    <TaskRow key={task.id} task={task} goal={task.goalId ? goalById.get(task.goalId) : undefined} onToggle={() => toggleTask(task.id)} onEdit={() => setTaskEditor(task)} onDelete={() => deleteTask(task.id)} compact />
                  ))}
                </div>
                <button className="add-row" onClick={() => openNewTask(today)}>＋ 添加今天的任务</button>
              </section>

              <aside className="right-column">
                <section className="panel wellness-mini">
                  <div className="panel-heading"><div><p className="section-kicker">BODY CHECK</p><h3>身体也要签到</h3></div><strong>{habitDone}/{data.habits.length}</strong></div>
                  <div className="habit-grid">
                    {data.habits.map((habit) => (
                      <button key={habit.id} className={`habit-tile ${habit.done ? "done" : ""}`} onClick={() => setData((current) => ({ ...current, habits: current.habits.map((item) => item.id === habit.id ? { ...item, done: !item.done } : item) }))}>
                        <span>{habit.icon}</span><small>{habit.label}</small><i>{habit.done ? "✓" : "+"}</i>
                      </button>
                    ))}
                  </div>
                  <div className="wellness-mini-links"><button className="text-link" onClick={() => setView("meals")}>安排这周吃什么 <span>→</span></button><button className="text-link" onClick={() => setView("wellness")}>打开健康与运动 <span>→</span></button></div>
                </section>
                <section className="panel next-class">
                  <p className="section-kicker">UP NEXT</p>
                  {upcomingTask && upcomingDate ? <><div className="next-class-date"><span>{upcomingDate.day}</span><small>{upcomingDate.month}<br />{upcomingDate.weekday}</small></div><div><button className="next-task-title" onClick={() => setTaskEditor(upcomingTask)}>{upcomingTask.title}</button><p>{upcomingTask.time || "全天"} · {upcomingTask.category}</p></div></> : <div className="next-task-empty"><h3>接下来暂未安排</h3><button className="text-link" onClick={() => openNewTask()}>添加任务 →</button></div>}
                </section>
              </aside>
            </div>

            <section className="goals-section">
              <div className="section-heading-row"><div><p className="section-kicker">NORTH STARS</p><h2>当前最重要的三条主线</h2></div><button className="ghost-button" onClick={() => setView("goals")}>管理长期目标</button></div>
              <div className="goal-grid">
                {data.goals.slice(0, 3).map((goal, index) => {
                  const stats = goalTaskStats.get(goal.id) || { open: 0, done: 0 };
                  return <article draggable className={`goal-card ${goal.tone} ${draggedGoalId === goal.id ? "dragging" : ""} ${dragOverGoalId === goal.id ? "drag-over" : ""}`} key={goal.id} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", goal.id); setDraggedGoalId(goal.id); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverGoalId(goal.id); }} onDrop={(event) => { event.preventDefault(); const sourceId = event.dataTransfer.getData("text/plain") || draggedGoalId; if (sourceId) moveGoal(sourceId, goal.id); setDraggedGoalId(null); setDragOverGoalId(null); }} onDragEnd={() => { setDraggedGoalId(null); setDragOverGoalId(null); }}>
                    <div className="goal-number">0{index + 1} · {goalPriorityLabel(index)}</div><span className="goal-drag-handle" aria-hidden="true">⋮⋮</span><div className="mobile-goal-order"><button disabled={index === 0} onClick={(event) => { event.stopPropagation(); moveGoalByOffset(goal.id, -1); }} aria-label={`提高${goal.title}的优先级`}>↑</button><button disabled={index === data.goals.length - 1} onClick={(event) => { event.stopPropagation(); moveGoalByOffset(goal.id, 1); }} aria-label={`降低${goal.title}的优先级`}>↓</button></div>
                    <button className="more-button" onClick={() => setGoalEditor(goal)} aria-label={`编辑${goal.title}`}>•••</button>
                    <h3>{goal.title}</h3><p>{goal.description}</p>
                    <div className={`goal-next-step ${stats.open === 0 ? "empty" : ""}`}><span>{stats.open > 0 ? `${stats.open} 个待完成下一步` : "还没有可执行的下一步"}{stats.done > 0 ? ` · ${stats.done} 已完成` : ""}</span><button onClick={(event) => { event.stopPropagation(); openNewTask(today, goal.id); }}>＋ 添加下一步</button></div>
                    <div className="goal-footer"><span>{goal.metric}</span><strong>{goal.progress}%</strong></div>
                    <div className="goal-progress"><span style={{ width: `${goal.progress}%` }} /></div>
                  </article>
                })}
              </div>
            </section>
          </div>
        )}

        {view === "goals" && (
          <div className="page-content goals-page">
            <section className="goals-hero">
              <div><p className="section-kicker">LIFE DIRECTIONS</p><h2>学期会结束，<br />方向会继续。</h2><p>MAP 不把人生做成一张永远完不成的待办清单。这里保存真正值得几年投入的方向：事业、家庭、住房、健康或你自己的项目；具体行动再落到任务里。</p></div>
              <button className="primary-button" onClick={() => setGoalEditor("new")}>＋ 新建长期目标</button>
            </section>
            <section className="life-horizons">
              <div className="horizon-line"><span>NOW</span><i /><span>1 YEAR</span><i /><span>3 YEARS</span><i /><span>5+ YEARS</span></div>
              <div className="goal-order-guide"><span>优先级按从左到右、从上到下排列</span><strong>拖动卡片即可改变顺序</strong></div>
              <div className="goal-grid expanded">
                {data.goals.map((goal, index) => {
                  const stats = goalTaskStats.get(goal.id) || { open: 0, done: 0 };
                  return <article draggable className={`goal-card ${goal.tone} ${draggedGoalId === goal.id ? "dragging" : ""} ${dragOverGoalId === goal.id ? "drag-over" : ""}`} key={goal.id} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", goal.id); setDraggedGoalId(goal.id); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverGoalId(goal.id); }} onDrop={(event) => { event.preventDefault(); const sourceId = event.dataTransfer.getData("text/plain") || draggedGoalId; if (sourceId) moveGoal(sourceId, goal.id); setDraggedGoalId(null); setDragOverGoalId(null); }} onDragEnd={() => { setDraggedGoalId(null); setDragOverGoalId(null); }}><div className="goal-number">0{index + 1} · {goalPriorityLabel(index)}</div><span className="goal-drag-handle" aria-hidden="true">⋮⋮</span><div className="mobile-goal-order"><button disabled={index === 0} onClick={(event) => { event.stopPropagation(); moveGoalByOffset(goal.id, -1); }} aria-label={`提高${goal.title}的优先级`}>↑</button><button disabled={index === data.goals.length - 1} onClick={(event) => { event.stopPropagation(); moveGoalByOffset(goal.id, 1); }} aria-label={`降低${goal.title}的优先级`}>↓</button></div><button className="more-button" onClick={() => setGoalEditor(goal)} aria-label={`编辑${goal.title}`}>•••</button><h3>{goal.title}</h3><p>{goal.description}</p><div className={`goal-next-step ${stats.open === 0 ? "empty" : ""}`}><span>{stats.open > 0 ? `${stats.open} 个待完成下一步` : "还没有可执行的下一步"}{stats.done > 0 ? ` · ${stats.done} 已完成` : ""}</span><button onClick={(event) => { event.stopPropagation(); openNewTask(today, goal.id); }}>＋ 添加下一步</button></div><div className="goal-footer"><span>{goal.metric}</span><strong>{goal.progress}%</strong></div><div className="goal-progress"><span style={{ width: `${goal.progress}%` }} /></div></article>;
                })}
                <button className="goal-add-card" onClick={() => setGoalEditor("new")}><span>＋</span><strong>添加下一条人生主线</strong><small>买房、家庭、工作、个人项目……</small></button>
              </div>
            </section>
            <section className="goal-principle"><span>原则</span><p>长期目标回答“我想把人生推向哪里”，里程碑回答“怎样知道我正在靠近”，任务只回答“下一步做什么”。</p></section>
          </div>
        )}

        {view === "semester" && (
          <div className="page-content semester-page">
            <section className="semester-summary">
              <div><p className="section-kicker">CURRENT PHASE · {data.phase.label}</p><h2>{formatShortDate(data.phase.startDate)} <span>→</span> {formatShortDate(data.phase.endDate)}</h2><p>{phaseWeeks} 周 · {courseCount} 门课 · {taCount} 份 TA · {data.phase.goalId && goalById.get(data.phase.goalId) ? `服务目标：${goalById.get(data.phase.goalId)?.title}` : `结果：${data.phase.outcome}`}</p></div>
              <div className="semester-summary-actions"><button className="ghost-button" onClick={() => setPhaseEditor(true)}>编辑阶段</button><button className="ghost-button" onClick={() => setScheduleEditor("new")}>＋ 添加固定安排</button></div>
            </section>

            <div className="semester-viewbar">
              <div className="view-switch" role="group" aria-label="阶段地图视图"><button className={semesterMode === "week" ? "active" : ""} onClick={() => setSemesterMode("week")}>周课表</button><button className={semesterMode === "calendar" ? "active" : ""} onClick={() => setSemesterMode("calendar")}>月历</button></div>
              <p>{semesterMode === "week" ? "抓住区块右上角的排序手柄，直接调整固定课程与本周任务的先后。" : "月历显示整个月的全部安排。"}</p>
            </div>

            {semesterMode === "calendar" ? <section className="panel calendar-panel">
              <div className="calendar-toolbar">
                <div><p className="section-kicker">CALENDAR</p><h3>{calendarMonthLabel}</h3><span>{visibleTaskCount} 项任务 · {visibleRoutineCount} 次固定任务 · {visibleScheduleCount} 次固定安排</span></div>
                <div className="calendar-nav"><button onClick={() => moveCalendar(-1)} aria-label="上个月">←</button><button className="calendar-today" onClick={moveCalendarToToday}>今天</button><button onClick={() => moveCalendar(1)} aria-label="下个月">→</button></div>
              </div>
              {monthlySpanTasks.length > 0 && <section className="month-span-section">
                <header><div><strong>本月跨度任务</strong><span>只显示一次，不再每天重复</span></div><i>{monthlySpanTasks.length}</i></header>
                <div className="month-span-list">{monthlySpanTasks.map((task) => <article key={task.id} draggable className={`month-span-task ${categoryTone[task.category]} ${task.status === "done" ? "done" : ""} ${task.carriedFrom && task.status === "todo" ? "carried" : ""} ${draggedTaskId === task.id ? "dragging" : ""}`} onDragStart={(event) => beginTaskDrag(event, task)} onDragEnd={endTaskDrag}>
                  <TaskCalendarCheck task={task} onToggle={() => toggleTask(task.id)} />
                  <button className="month-span-open" onClick={() => setTaskEditor(task)}><span className="month-span-duration">{daysBetween(task.date, task.endDate!) + 1}<small>天</small></span><span><strong>{task.title}</strong><small>{formatDate(task.date)} → {formatDate(task.endDate!)}</small></span><em>{task.status === "done" ? "已完成" : task.carriedFrom ? "已顺延" : "进行中"}</em></button>
                </article>)}</div>
              </section>}
              <div className="calendar-scroll">
                <div className="calendar-grid">
                  {CALENDAR_DAY_LABEL.map((label, index) => <div className={`calendar-weekday ${index > 4 ? "weekend" : ""}`} key={label}>{label}</div>)}
                  {calendarCells.map((cell) => {
                    const tasks = calendarTasks.filter((task) => !isMultiDayTask(task) && task.date === cell.key).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
                    const routines = data.routines.filter((routine) => isRoutineDueOn(routine, cell.key) && !routine.completedDates.includes(cell.key)).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
                    const schedules = cell.key >= data.phase.startDate && cell.key <= data.phase.endDate ? data.schedule.filter((item) => item.days.includes(cell.dayCode)).sort((a, b) => a.start.localeCompare(b.start)) : [];
                    const events = [...tasks.map((task) => ({ type: "task" as const, time: task.time, item: task })), ...routines.map((routine) => ({ type: "routine" as const, time: routine.time, item: routine })), ...schedules.map((item) => ({ type: "schedule" as const, time: item.start, item }))].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
                    return <article className={`calendar-day ${cell.inMonth ? "" : "outside"} ${cell.key === today ? "today" : ""} ${taskDropDate === cell.key ? "task-drop-target" : ""}`} key={cell.key} onDragOver={(event) => allowTaskDrop(event, cell.key)} onDrop={(event) => dropTaskOnDate(event, cell.key)}>
                      <header><span>{cell.day}</span>{cell.key === today && <strong>今天</strong>}<button onClick={() => openNewTask(cell.key)} aria-label={`在 ${cell.key} 新建任务`}>＋</button></header>
                      <div className="calendar-events">
                        {events.map((event) => event.type === "task" ? <div key={`task-${event.item.id}`} draggable className={`calendar-event task ${categoryTone[event.item.category]} ${event.item.status === "done" ? "done" : ""} ${event.item.carriedFrom && event.item.status === "todo" ? "carried" : ""} ${draggedTaskId === event.item.id ? "dragging" : ""}`} onDragStart={(dragEvent) => beginTaskDrag(dragEvent, event.item)} onDragEnd={endTaskDrag} title={`${event.item.title} · 拖到其他日期可改期${event.item.details ? ` · ${event.item.details}` : ""}${event.item.carriedFrom && event.item.status === "todo" ? ` · 未完成顺延，原定 ${formatDate(event.item.carriedFrom)}` : ""}`}><TaskCalendarCheck task={event.item} onToggle={() => toggleTask(event.item.id)} /><button className="calendar-task-open" onClick={() => setTaskEditor(event.item)}><time>{event.time || "全天"}</time><span>{event.item.title}</span></button></div> : event.type === "routine" ? <div key={`routine-${event.item.id}`} className={`calendar-event routine ${categoryTone[event.item.category]} ${event.item.completedDates.includes(cell.key) ? "done" : ""}`} title={`${event.item.title} · ${routineFrequencyLabel(event.item)}`}><RoutineCalendarCheck completed={event.item.completedDates.includes(cell.key)} label={event.item.title} onToggle={() => toggleRoutineCompletion(event.item.id, cell.key)} /><button className="calendar-task-open" onClick={() => setRoutineEditor(event.item)}><time>{event.time || "全天"}</time><span>{event.item.title}</span></button></div> : <button key={`schedule-${event.item.id}`} className={`calendar-event schedule ${event.item.color}`} onClick={() => setScheduleEditor(event.item)} title={`${event.item.title} · ${event.item.room}`}><time>{event.item.start}</time><span>{event.item.code}</span></button>)}
                      </div>
                    </article>;
                  })}
                </div>
              </div>
              <div className="mobile-month-view">
                <div className="mobile-month-weekdays" aria-hidden="true">{CALENDAR_DAY_LABEL.map((label) => <span key={label}>{label.slice(1)}</span>)}</div>
                <div className="mobile-month-grid">
                  {calendarCells.map((cell) => {
                    const counts = mobileCalendarCounts.get(cell.key) || { taskCount: 0, routineCount: 0, scheduleCount: 0, total: 0 };
                    return <button type="button" key={cell.key} className={`${cell.inMonth ? "" : "outside"} ${cell.key === today ? "today" : ""} ${cell.key === mobileCalendarDate ? "selected" : ""}`} onClick={() => setMobileCalendarDate(cell.key)} aria-label={`${formatDate(cell.key)}，${counts.total} 项安排`}>
                      <span>{cell.day}</span>
                      <i aria-hidden="true">{counts.taskCount > 0 && <b className="task" />}{counts.routineCount > 0 && <b className="routine" />}{counts.scheduleCount > 0 && <b className="schedule" />}</i>
                      {counts.total > 0 && <small>{counts.total}</small>}
                    </button>;
                  })}
                </div>
                <section className="mobile-day-agenda">
                  <header><div><small>{formatWeekday(mobileCalendarDate)}</small><h4>{formatDate(mobileCalendarDate)}</h4></div><button onClick={() => openNewTask(mobileCalendarDate)}>＋ 添加</button></header>
                  <div className="mobile-agenda-list">
                    {mobileSelectedTasks.map((task) => <article key={task.id} className={`mobile-agenda-item task ${categoryTone[task.category]} ${task.carriedFrom ? "carried" : ""}`}><TaskCalendarCheck task={task} onToggle={() => toggleTask(task.id)} /><button onClick={() => setTaskEditor(task)}><time>{task.date === mobileCalendarDate ? task.time || "全天" : "持续"}</time><span><strong>{task.title}</strong><small>{task.endDate ? `${formatDate(task.date)} → ${formatDate(task.endDate)}` : task.category}{task.details ? ` · ${task.details}` : ""}</small></span></button></article>)}
                    {mobileSelectedRoutines.map((routine) => <article key={routine.id} className={`mobile-agenda-item routine ${categoryTone[routine.category]}`}><RoutineCalendarCheck completed={routine.completedDates.includes(mobileCalendarDate)} label={routine.title} onToggle={() => toggleRoutineCompletion(routine.id, mobileCalendarDate)} /><button onClick={() => setRoutineEditor(routine)}><time>{routine.time || "全天"}</time><span><strong>{routine.title}</strong><small>固定任务 · {routineFrequencyLabel(routine)}</small></span></button></article>)}
                    {mobileSelectedSchedules.map((item) => <button key={item.id} className={`mobile-agenda-item schedule ${item.color}`} onClick={() => setScheduleEditor(item)}><span className="mobile-agenda-symbol">{item.kind === "TA" ? "TA" : "课"}</span><time>{item.start}</time><span><strong>{item.code}</strong><small>{item.title} · {item.room}</small></span></button>)}
                    {mobileSelectedTasks.length === 0 && mobileSelectedRoutines.length === 0 && mobileSelectedSchedules.length === 0 && <div className="mobile-agenda-empty"><span>○</span><p>这一天没有安排</p><button onClick={() => openNewTask(mobileCalendarDate)}>添加一个任务</button></div>}
                  </div>
                </section>
              </div>
              <div className="calendar-legend"><span><i className="task" />当天任务</span><span><i className="routine" />固定任务</span><span><i className="schedule" />课程 / TA</span><small>完成后自动从日历隐藏 · 拖动普通任务到日期格即可改期 · 可在任务总览查看</small></div>
            </section> : <section className="panel schedule-panel">
              <div className="panel-heading"><div><p className="section-kicker">THIS WEEK</p><h3>本周总览</h3></div><span className="counter">{formatDate(weekStart)}—{formatDate(weekEnd)} · {weeklyTasks.length} 项任务 · {weeklyRoutineCount} 次固定任务</span></div>
              <div className="semester-week-modules">
              <section className={`semester-week-module schedule-module ${draggedSemesterModule === "schedule" ? "dragging" : ""} ${dragOverSemesterModule === "schedule" ? "drag-over" : ""}`} style={{ order: semesterWeekOrder.indexOf("schedule") }} onDragOver={(event) => { if (!draggedSemesterModule) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverSemesterModule("schedule"); }} onDrop={(event) => { if (!draggedSemesterModule) return; event.preventDefault(); event.stopPropagation(); moveSemesterModule(draggedSemesterModule, "schedule"); setDraggedSemesterModule(null); setDragOverSemesterModule(null); }}>
              <div className="fixed-schedule-heading first"><div><p className="section-kicker">WEEKLY RHYTHM</p><h3>每周固定课程与 TA</h3></div><div className="semester-module-meta"><span>点击安排可编辑</span><button type="button" draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-map-semester-module", "schedule"); setDraggedSemesterModule("schedule"); }} onDragEnd={() => { setDraggedSemesterModule(null); setDragOverSemesterModule(null); }} aria-label="拖动每周固定课程区块排序" title="拖动区块排序">⋮⋮ 拖动排序</button></div></div>
              <div className="schedule-scroll">
                <div className="schedule-grid">
                  <div className="time-column">
                    <span className="time-corner" aria-hidden="true" />
                    <div className="time-body">
                      {["8 AM", "10 AM", "12 PM", "2 PM", "4 PM", "6 PM"].map((label, index) => <span key={label} style={{ top: `${index * 20}%` }}><em>{label}</em></span>)}
                    </div>
                  </div>
                  {DAY_ORDER.map((day) => (
                    <div className="day-column" key={day}>
                      <header><strong>{DAY_LABEL[day]}</strong><small>{day.toUpperCase()}</small></header>
                      <div className="day-body">
                        {[0, 1, 2, 3, 4, 5].map((line) => <i key={line} style={{ top: `${line * 20}%` }} />)}
                        {data.schedule.filter((item) => item.days.includes(day)).map((item) => {
                          const top = ((timeToMinutes(item.start) - 480) / 600) * 100;
                          const height = ((timeToMinutes(item.end) - timeToMinutes(item.start)) / 600) * 100;
                          return <button key={item.id} className={`schedule-block ${item.color}`} style={{ top: `${top}%`, height: `${height}%` }} onClick={() => setScheduleEditor(item)}><strong>{item.code}</strong><span>{item.start}—{item.end}</span><small>{item.room}</small></button>;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mobile-schedule-agenda">
                {DAY_ORDER.map((day) => {
                  const items = data.schedule.filter((item) => item.days.includes(day)).slice().sort((a, b) => a.start.localeCompare(b.start));
                  return <section key={day} className="mobile-schedule-day"><header><div><strong>{DAY_LABEL[day]}</strong><small>{day.toUpperCase()}</small></div><span>{items.length || "—"}</span></header><div>{items.length > 0 ? items.map((item) => <button key={item.id} className={`mobile-schedule-item ${item.color}`} onClick={() => setScheduleEditor(item)}><time>{item.start}<small>{item.end}</small></time><span><strong>{item.code}</strong><small>{item.title}</small><em>{item.room}</em></span></button>) : <p>无固定安排</p>}</div></section>;
                })}
              </div>
              </section>
              <section className={`semester-week-module week-task-section ${draggedSemesterModule === "tasks" ? "dragging" : ""} ${dragOverSemesterModule === "tasks" ? "drag-over" : ""}`} style={{ order: semesterWeekOrder.indexOf("tasks") }} onDragOver={(event) => { if (!draggedSemesterModule) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverSemesterModule("tasks"); }} onDrop={(event) => { if (!draggedSemesterModule) return; event.preventDefault(); event.stopPropagation(); moveSemesterModule(draggedSemesterModule, "tasks"); setDraggedSemesterModule(null); setDragOverSemesterModule(null); }}>
                <div className="week-task-heading"><strong>本周任务</strong><div className="semester-module-meta"><span>完成后隐藏 · 拖动任务可改日期</span><button type="button" draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-map-semester-module", "tasks"); setDraggedSemesterModule("tasks"); }} onDragEnd={() => { setDraggedSemesterModule(null); setDragOverSemesterModule(null); }} aria-label="拖动本周任务区块排序" title="拖动区块排序">⋮⋮ 拖动排序</button></div></div>
                <div className="week-task-scroll">
                  {weeklySpanTasks.length > 0 && <section className="week-span-section">
                    <div className="week-span-title"><div><strong>持续推进</strong><span>跨日任务按真实周期横跨本周</span></div><i>{weeklySpanTasks.length} 项</i></div>
                    <div className="mobile-week-span-list">{weeklySpanTasks.map((task) => <article key={task.id} className={`mobile-week-span-item ${categoryTone[task.category]} ${task.carriedFrom ? "carried" : ""}`}><TaskCalendarCheck task={task} onToggle={() => toggleTask(task.id)} /><button onClick={() => setTaskEditor(task)}><span><strong>{task.title}</strong><small>{formatDate(task.date)} → {formatDate(task.endDate!)}</small></span><i>{task.carriedFrom ? "顺延" : "进行中"}</i></button></article>)}</div>
                    <div className="week-span-calendar">
                      <div className="week-span-days">{weekDays.map((day) => <span className={`${day.key === today ? "today" : ""} ${taskDropDate === day.key ? "task-drop-target" : ""}`} key={day.key} onDragOver={(event) => allowTaskDrop(event, day.key)} onDrop={(event) => dropTaskOnDate(event, day.key)}>{day.label}<small>{day.date}</small></span>)}</div>
                      {weeklySpanTasks.map((task) => {
                        const clippedStart = task.date < weekStart ? weekStart : task.date;
                        const clippedEnd = (task.endDate || task.date) > weekEnd ? weekEnd : task.endDate || task.date;
                        const startIndex = weekDays.findIndex((day) => day.key === clippedStart);
                        const endIndex = weekDays.findIndex((day) => day.key === clippedEnd);
                        return <div className="week-span-lane" key={task.id}><article draggable className={`week-span-bar ${categoryTone[task.category]} ${task.status === "done" ? "done" : ""} ${task.carriedFrom && task.status === "todo" ? "carried" : ""} ${draggedTaskId === task.id ? "dragging" : ""}`} style={{ gridColumn: `${startIndex + 1} / ${endIndex + 2}` }} onDragStart={(event) => beginTaskDrag(event, task)} onDragEnd={endTaskDrag} title={`${task.title} · ${formatDate(task.date)} 至 ${formatDate(task.endDate!)} · 拖到某天可整体改期`}><TaskCalendarCheck task={task} onToggle={() => toggleTask(task.id)} /><button className="week-span-open" onClick={() => setTaskEditor(task)}><span><strong>{task.title}</strong><small>{formatDate(task.date)} → {formatDate(task.endDate!)}</small></span><i>{task.status === "done" ? "完成" : task.carriedFrom ? "顺延" : "进行中"}</i></button></article></div>;
                      })}
                    </div>
                  </section>}
                  <div className="week-task-grid">
                    {weekDays.map((day) => {
                      const tasks = calendarTasks.filter((task) => !isMultiDayTask(task) && task.date === day.key).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
                      const routines = data.routines.filter((routine) => isRoutineDueOn(routine, day.key) && !routine.completedDates.includes(day.key)).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
                      return <article className={`week-task-day ${day.key === today ? "today" : ""} ${taskDropDate === day.key ? "task-drop-target" : ""}`} key={day.key} onDragOver={(event) => allowTaskDrop(event, day.key)} onDrop={(event) => dropTaskOnDate(event, day.key)}>
                        <header><div><strong>{day.label}</strong><span>{day.date}</span></div>{day.key === today && <i>今天</i>}</header>
                        <div className="week-task-list">
                          {routines.map((routine) => <article key={routine.id} className={`week-task-item routine ${categoryTone[routine.category]} ${routine.completedDates.includes(day.key) ? "done" : ""}`}><RoutineCalendarCheck completed={routine.completedDates.includes(day.key)} label={routine.title} onToggle={() => toggleRoutineCompletion(routine.id, day.key)} /><button className="week-task-open" onClick={() => setRoutineEditor(routine)}><time>{routine.time || "全天"}</time><span>{routine.title}<small>{routineFrequencyLabel(routine)}</small></span></button></article>)}
                          {tasks.map((task) => <article key={task.id} draggable className={`week-task-item ${categoryTone[task.category]} ${task.status === "done" ? "done" : ""} ${task.carriedFrom && task.status === "todo" ? "carried" : ""} ${draggedTaskId === task.id ? "dragging" : ""}`} onDragStart={(event) => beginTaskDrag(event, task)} onDragEnd={endTaskDrag} title="拖到其他日期可改期"><TaskCalendarCheck task={task} onToggle={() => toggleTask(task.id)} /><button className="week-task-open" onClick={() => setTaskEditor(task)}><time>{task.date === day.key ? task.time || "全天" : "持续"}</time><span>{task.title}{task.details && <small className="week-task-detail">{task.details}</small>}{task.carriedFrom && task.status === "todo" && <small>未完成顺延 · 原定 {formatDate(task.carriedFrom)}</small>}</span></button></article>)}
                          {tasks.length === 0 && routines.length === 0 && <span className="week-task-empty">暂无任务</span>}
                        </div>
                        <button className="week-task-add" onClick={() => openNewTask(day.key)}>＋ 添加</button>
                      </article>;
                    })}
                  </div>
                </div>
              </section>
              </div>
            </section>}

            <section className="month-map">
              {phaseCheckpoints.map((item) => <article key={item.title} className={`month-card ${item.tone} ${item.date <= today ? "reached" : ""}`}><span>{formatDate(item.date)}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}
            </section>
          </div>
        )}

        {view === "career" && (
          <div className="page-content career-page">
            <section className="career-summary">
              <div><p className="section-kicker">OPPORTUNITY PIPELINE</p><h2>{visibleApplications.length}</h2><p>{applicationDateFilter === "all" ? "个机会正在记录 · 现有一年实习 Offer 作为保底" : `${formatDate(applicationDateFilter)} 投递 · 全部共 ${data.applications.length} 个机会`}</p></div>
              <div className="career-actions"><label className="application-date-filter"><span>投递日期</span><select value={applicationDateFilter} onChange={(event) => setApplicationDateFilter(event.target.value)}><option value="all">全部日期 · {data.applications.length} 份</option>{applicationDateCounts.map(([date, count]) => <option value={date} key={date}>{formatDate(date)} · {count} 份</option>)}</select></label><button className="primary-button" onClick={() => setApplicationEditor("new")}>＋ 添加公司</button></div>
            </section>
            <div className="pipeline-guide"><span>{applicationDateFilter === "all" ? "拖动卡片即可更新进度" : `正在查看 ${formatDate(applicationDateFilter)} 的 ${visibleApplications.length} 份投递`}</span><i>已投 → 面试 → Offer / 拒绝</i></div>
            <section className="pipeline">
              {APPLICATION_STAGES.map((stage) => {
                const applications = visibleApplications.filter((application) => application.stage === stage);
                return <div className={`pipeline-column ${dragOverStage === stage ? "drag-over" : ""}`} key={stage} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverStage(stage); }} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain") || draggedApplicationId; if (id) moveApplication(id, stage); setDraggedApplicationId(null); setDragOverStage(null); }}><header><strong>{stage}</strong><span>{applications.length}</span></header><div className="pipeline-stack">{applications.map((application) => <button draggable className={`application-card ${draggedApplicationId === application.id ? "dragging" : ""}`} key={application.id} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", application.id); setDraggedApplicationId(application.id); }} onDragEnd={() => { setDraggedApplicationId(null); setDragOverStage(null); }} onClick={() => setApplicationEditor(application)}><span className="company-initial">{application.company.slice(0, 1).toUpperCase()}</span><strong>{application.company}</strong><p>{application.role}</p>{application.date && <small>{formatDate(application.date)}</small>}<i className="drag-handle" aria-hidden="true">⋮⋮</i></button>)}<button className="pipeline-add" onClick={() => setApplicationEditor("new")}>＋ 添加</button></div></div>;
              })}
            </section>
            {data.applications.length > 0 && visibleApplications.length === 0 && <section className="career-filter-empty"><span>这个日期没有投递记录。</span><button className="text-link" onClick={() => setApplicationDateFilter("all")}>查看全部日期 →</button></section>}
            {data.applications.length === 0 && <section className="career-empty"><span>先从一个值得关注的公司开始</span><h3>不用海投。把真正比现有 Offer 更好的机会留下来，持续推进。</h3><button className="text-link" onClick={openJobCaptureAI}>打开 MAP AI 添加职位 →</button></section>}
          </div>
        )}

        {view === "planner" && (
          <div className="page-content planner-page">
            <section className="panel routine-manager">
              <div className="panel-heading"><div><p className="section-kicker">RECURRING ACTIONS</p><h3>固定任务</h3><p>每天或每隔几天自动出现；每次单独打卡，不会生成一堆重复任务。</p></div><button className="primary-button" onClick={() => setRoutineEditor("new")}>＋ 新建固定任务</button></div>
              <div className="routine-list">
                {data.routines.map((routine) => <article className={`routine-row ${routine.active ? "" : "paused"}`} key={routine.id}>
                  <span className={`routine-symbol ${categoryTone[routine.category]}`}>↻</span>
                  <button className="routine-row-main" onClick={() => setRoutineEditor(routine)}><strong>{routine.title}</strong><span>{routineFrequencyLabel(routine)} · {routine.time || "全天"} · 从 {formatDate(routine.startDate)} 开始{routine.active ? ` · 下次 ${formatDate(nextRoutineOccurrence(routine, today) || routine.startDate)}` : " · 已暂停"}</span>{routine.details && <small>{routine.details}</small>}</button>
                  <span className={`category-pill ${categoryTone[routine.category]}`}>{routine.category}</span>
                  <div className="routine-row-actions"><button onClick={() => toggleRoutineActive(routine.id)}>{routine.active ? "暂停" : "恢复"}</button><button onClick={() => setRoutineEditor(routine)}>编辑</button><button onClick={() => deleteRoutine(routine.id)}>删除</button></div>
                </article>)}
                {data.routines.length === 0 && <div className="empty-state">还没有固定任务。可以添加每日刷题，或每隔两天找工作。</div>}
              </div>
            </section>
            <div className="planner-toolbar">
              <div className="filter-row">{(["全部", "学业", "求职", "生活", "健康"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}<span>{item === "全部" ? statusFilteredTasks.length : statusFilteredTasks.filter((task) => task.category === item).length}</span></button>)}</div>
              <div className="planner-controls"><label className="goal-filter"><span>关联目标</span><select value={goalFilter} onChange={(event) => setGoalFilter(event.target.value)}><option value="all">全部目标</option><option value="none">未关联目标</option>{data.goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.title}</option>)}</select></label><div className="status-switch" role="group" aria-label="任务状态筛选"><button className={plannerStatusFilter === "open" ? "active" : ""} onClick={() => setPlannerStatusFilter("open")}>待处理</button><button className={plannerStatusFilter === "done" ? "active" : ""} onClick={() => setPlannerStatusFilter("done")}>已完成</button><button className={plannerStatusFilter === "all" ? "active" : ""} onClick={() => setPlannerStatusFilter("all")}>全部</button></div></div>
            </div>
            <p className="task-retention-note">完成任务会保留 60 天，之后自动从界面归档；导出备份仍会保留历史数据。</p>
            <section className="panel task-library">
              <div className="task-table-head"><span>任务</span><span>日期</span><span>类别</span><span>状态</span><span /></div>
              {plannerTasks.map((task) => <TaskRow key={task.id} task={task} goal={task.goalId ? goalById.get(task.goalId) : undefined} onToggle={() => toggleTask(task.id)} onEdit={() => setTaskEditor(task)} onDelete={() => deleteTask(task.id)} />)}
              {plannerTasks.length === 0 && <div className="empty-state">这里暂时没有符合条件的任务。</div>}
            </section>
          </div>
        )}

        {view === "notes" && (
          <div className="page-content notes-page">
            <section className="notes-mode-bar" aria-label="草稿箱模式">
              <div><button className={notesMode === "backlog" ? "active" : ""} onClick={() => { setNotesMode("backlog"); setNoteFilter("全部"); }}>待安排的小事 <span>{backlogCount}</span></button><button className={notesMode === "ideas" ? "active" : ""} onClick={openIdeaNotes}>灵感笔记 <span>{ideaNotes.length}</span></button></div>
              <p>{notesMode === "backlog" ? "短小、未排期，准备好后直接变成任务。" : "像备忘录一样自由写长内容；第一行自动成为标题。"}</p>
            </section>

            {notesMode === "backlog" ? <section className="draft-workbench">
              <aside className="draft-capture">
                <div className="draft-capture-head"><div><p className="section-kicker">QUICK BACKLOG</p><h2>先记小事，<br />暂时不排期。</h2></div><span><strong>{backlogCount}</strong> 条待安排</span></div>
                <p>适合要买的东西、待处理的小事和还没决定哪天做的 backlog。长篇想法请放进“灵感笔记”。</p>
                <div className={`draft-input-shell ${draftVoiceState}`}>
                  <textarea ref={noteDraftRef} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); saveQuickNote(); } }} placeholder={draftVoiceState === "recording" ? "正在听…说完后再点一次停止" : draftVoiceState === "transcribing" ? "正在转写并整理成清晰的小事…" : "例如：买眼药水；之后再决定哪天去。"} aria-label="快速记录待安排的小事" />
                  <button type="button" className={`draft-voice-button ${draftVoiceState}`} onClick={() => void toggleVoiceInput("draft")} disabled={!online || draftVoiceState === "transcribing" || (voiceState !== "idle" && voiceTarget !== "draft")} aria-label={draftVoiceState === "recording" ? "停止草稿录音" : draftVoiceState === "transcribing" ? "正在转写草稿语音" : "用语音记录草稿"}><span>{draftVoiceState === "recording" ? "■" : draftVoiceState === "transcribing" ? "…" : "麦"}</span>{draftVoiceState === "recording" ? "停止" : draftVoiceState === "transcribing" ? "转写中" : "语音记录"}</button>
                </div>
                <div className="draft-voice-meta"><span>{online ? "高质量转写后追加进编辑框，不自动保存" : "语音需要联网，打字仍可离线保存"}</span><strong>最长 2 分钟</strong></div>
                {draftVoiceError && <p className="draft-voice-error" role="status">{draftVoiceError}</p>}
                <div className="draft-type-label">归到哪里？</div>
                <div className="note-category-switch" role="group" aria-label="草稿分类">{(["待办", "课程", "项目", "求职", "生活"] as NoteCategory[]).map((category) => <button key={category} className={noteCategory === category ? "active" : ""} onClick={() => setNoteCategory(category)}>{category}</button>)}</div>
                <div className="draft-save"><span>⌘ / Ctrl + Enter</span><button onClick={saveQuickNote} disabled={!noteDraft.trim()}>放进待安排 →</button></div>
              </aside>

              <section className="draft-inbox">
                <header><div><p className="section-kicker">UNSCHEDULED</p><h2>待安排</h2><span>{backlogCount} 条 · 置顶优先 · 准备好后可安排成任务</span></div><label className="note-search"><span>⌕</span><input value={noteQuery} onChange={(event) => setNoteQuery(event.target.value)} placeholder="搜索待安排" /></label></header>
                <div className="draft-filter-row" role="group" aria-label="筛选草稿">{(["全部", "待办", "课程", "项目", "求职", "生活"] as const).map((category) => <button key={category} className={noteFilter === category ? "active" : ""} onClick={() => setNoteFilter(category)}>{category}<span>{category === "全部" ? backlogCount : backlogNotes.filter((note) => note.category === category).length}</span></button>)}</div>
                {visibleNotes.length > 0 ? <div className="draft-list">{visibleNotes.map((note) => <article className={`draft-row note-${note.category} ${note.pinned ? "pinned" : ""}`} key={note.id}>
                  <button className="draft-pin" onClick={() => setData((current) => ({ ...current, notes: current.notes.map((item) => item.id === note.id ? { ...item, pinned: !item.pinned } : item) }))} aria-label={note.pinned ? "取消置顶" : "置顶草稿"} title={note.pinned ? "取消置顶" : "置顶"}>{note.pinned ? "●" : "○"}</button>
                  <button className="draft-row-body" onClick={() => setNoteEditor(note)}><span className="draft-category">{note.category}</span><div><h3>{noteTitle(note)}</h3>{notePreview(note) !== noteTitle(note) && <p>{notePreview(note)}</p>}</div><time>{formatNoteTime(note.updatedAt)}</time></button>
                  <div className="draft-row-actions"><button className="draft-schedule" onClick={() => promoteNoteToTask(note)}>安排成任务</button><button className="draft-delete" onClick={() => removeRecord("notes", note.id, `已删除草稿「${noteTitle(note)}」`)} aria-label={`删除草稿：${noteTitle(note)}`} title="删除草稿">×</button></div>
                </article>)}</div> : <div className="notes-empty"><span>{noteQuery || noteFilter !== "全部" ? "没有符合条件的小事" : "待安排还是空的"}</span><p>{noteQuery || noteFilter !== "全部" ? "换一个筛选条件或关键词。" : "把暂时不想排期的小事写在左边。"}</p></div>}
              </section>
            </section> : <section className={`idea-workbench ${ideaEditor ? "editing" : "browsing"}`}>
              <aside className="idea-sidebar panel">
                <header><div><p className="section-kicker">IDEA NOTEBOOK</p><h2>灵感笔记</h2><span>{ideaNotes.length} 篇 · 自动保存</span></div><button className="idea-new" onClick={createIdeaNote}>＋ 新笔记</button></header>
                <label className="idea-search"><span>⌕</span><input value={ideaQuery} onChange={(event) => setIdeaQuery(event.target.value)} placeholder="搜索灵感" /></label>
                <div className="idea-note-list">{ideaNotes.map((note) => <button className={`idea-note-row ${note.pinned ? "pinned" : ""} ${ideaEditor?.id === note.id ? "active" : ""}`} key={note.id} onClick={() => { setIdeaEditor(note); window.requestAnimationFrame(() => ideaDocumentRef.current?.focus()); }}><span>{note.pinned ? "●" : "✎"}</span><div><strong>{noteTitle(note)}</strong><p>{notePreview(note) || "空白灵感"}</p></div><time>{formatNoteTime(note.updatedAt)}</time></button>)}</div>
                {ideaNotes.length === 0 && <div className="idea-list-empty">{ideaQuery ? "没有找到相关灵感" : "突然有想法时，点“新笔记”就直接开始写"}</div>}
                <div className="idea-sidebar-tip"><strong>两种入口</strong><span>打字可完全离线；语音会联网做高质量转写。需要整理时，再交给 MAP AI 并确认预览。</span></div>
              </aside>

              <section className="idea-document panel">
                {ideaEditor ? <>
                  <header className="idea-document-toolbar"><div><button className="mobile-idea-back" onClick={() => setIdeaEditor(null)}>← 返回灵感列表</button><span>{ideaEditor.pinned ? "置顶灵感" : "自由笔记"}</span><time>自动保存 · {formatNoteTime(ideaEditor.updatedAt)}</time></div><div><button className="idea-ai-organize" onClick={() => openIdeaOrganizerAI(ideaEditor)} disabled={!online}>✦ 交给 MAP AI 整理</button><button className={`idea-voice-action ${ideaVoiceState}`} onClick={() => void toggleVoiceInput("idea")} disabled={!online || ideaVoiceState === "transcribing" || (voiceState !== "idle" && voiceTarget !== "idea")}>{ideaVoiceState === "recording" ? "■ 停止录音" : ideaVoiceState === "transcribing" ? "… 转写中" : "◉ 语音转文字"}</button><button onClick={() => updateIdeaNote(ideaEditor, { pinned: !ideaEditor.pinned })}>{ideaEditor.pinned ? "取消置顶" : "置顶"}</button><button className="idea-delete" onClick={() => deleteIdeaNote(ideaEditor)}>删除</button></div></header>
                  {ideaVoiceError && <p className="idea-voice-error" role="status">{ideaVoiceError}</p>}
                  <div className="idea-document-editor">
                    <textarea ref={ideaDocumentRef} value={ideaEditor.content} onChange={(event) => updateIdeaNote(ideaEditor, { content: event.target.value })} placeholder={ideaVoiceState === "recording" ? "正在听…说完后再点一次停止。" : ideaVoiceState === "transcribing" ? "正在做高质量语音转写…" : "第一行写标题，然后直接展开你的想法……\n\n你可以写一段推理、项目构想、观察或任何还不需要变成任务的内容。"} aria-label="灵感笔记内容" />
                  </div>
                </> : <div className="idea-document-empty"><span>✦</span><h2>记录完整想法，<br />不用把它压成一张小卡片。</h2><p>这里是自由文本编辑器。第一行自动成为标题；语音负责准确转成文字，需要改善结构时再交给 MAP AI。</p><button className="primary-button" onClick={createIdeaNote}>＋ 写第一篇灵感</button></div>}
              </section>
            </section>}
          </div>
        )}

        {view === "vault" && (
          <div className="page-content reference-page">
            <section className={`reference-workbench ${referenceEditor ? "editing" : "browsing"}`}>
              <aside className="reference-sidebar panel">
                <header><div><p className="section-kicker">PERSONAL NOTES</p><h2>私人速记</h2><span>{data.references.length} 条 · 自动保存</span></div><button className="reference-new" onClick={createReference}>＋ 新建</button></header>
                <label className="reference-search"><span>⌕</span><input value={referenceQuery} onChange={(event) => setReferenceQuery(event.target.value)} placeholder="搜索全部笔记" /></label>
                <div className="reference-note-list">{visibleReferences.map((reference) => <button className={`reference-note-row ${reference.pinned ? "pinned" : ""} ${referenceEditor?.id === reference.id ? "active" : ""}`} key={reference.id} onClick={() => { setReferenceEditor(reference); window.requestAnimationFrame(() => referenceDocumentRef.current?.focus()); }}><span title={reference.aiExcluded ? "仅本机：不进入 Cloudflare，AI 不可读" : "已允许 MAP AI 读取并同步到 Cloudflare"}>{reference.pinned ? "●" : reference.aiExcluded ? "⌁" : "✦"}</span><div><strong>{reference.title || "无标题速记"}</strong><p>{referencePreview(reference) || "空白笔记"}</p></div><time>{formatNoteTime(reference.updatedAt)}</time></button>)}</div>
                {visibleReferences.length === 0 && <div className="reference-list-empty">{referenceQuery ? "没有找到相关笔记" : "点击“新建”即可开始记录"}</div>}
                <button className="reference-ai-organize" onClick={openReferenceOrganizerAI}><span>✦</span><div><strong>让 MAP AI 整理粘贴内容</strong><small>只粘贴你愿意发送的内容；SIN 等可在右侧手动保存</small></div></button>
                <p className="reference-privacy-note">新笔记默认仅本机，不进入 Cloudflare，也不会提供给 AI。SSN / SIN / 密码等建议保持此状态。</p>
              </aside>

              <section className="reference-document panel">
                {referenceEditor ? <>
                  <header className="reference-document-toolbar"><div><button className="mobile-reference-back" onClick={() => setReferenceEditor(null)}>← 返回笔记列表</button><span>{referenceEditor.pinned ? "置顶笔记" : "私人笔记"}</span><time>自动保存 · {formatNoteTime(referenceEditor.updatedAt)}</time></div><div><button className={`reference-ai-access ${referenceEditor.aiExcluded ? "local-only" : "ai-readable"}`} onClick={() => updateReference(referenceEditor, { aiExcluded: !referenceEditor.aiExcluded })}>{referenceEditor.aiExcluded ? "仅本机 · 不同步" : "✦ AI 可读 · 云端同步"}</button><button onClick={() => toggleReferencePin(referenceEditor)}>{referenceEditor.pinned ? "取消置顶" : "置顶"}</button><button className={referenceCopiedId === referenceEditor.id ? "copied" : ""} onClick={() => void copyReference(referenceEditor)}>{referenceCopiedId === referenceEditor.id ? "已复制" : "复制全文"}</button><button className="reference-delete" onClick={() => deleteReference(referenceEditor)}>删除</button></div></header>
                  <p className={`reference-cloud-policy ${referenceEditor.aiExcluded ? "local-only" : "cloud-enabled"}`}>{referenceEditor.aiExcluded ? "只存在当前设备：不会上传 Cloudflare，也不会进入 MAP AI 上下文。" : "已授权：这条笔记会同步到你的 Cloudflare 私有数据，并可在你明确要求时提供给 MAP AI。"}</p>
                  <div className="reference-document-editor">
                    <input className="reference-title-input" value={referenceEditor.title === "无标题速记" ? "" : referenceEditor.title} onChange={(event) => updateReference(referenceEditor, { title: event.target.value || "无标题速记" })} placeholder="无标题速记" aria-label="笔记标题" />
                    <textarea ref={referenceDocumentRef} value={referenceEditor.content} onChange={(event) => { const content = event.target.value; const titleWasAutomatic = referenceEditor.title === "无标题速记" || referenceEditor.title === referenceTitleFromContent(referenceEditor.content); const nextTitle = titleWasAutomatic ? referenceTitleFromContent(content) : referenceEditor.title; updateReference(referenceEditor, { content, title: content.trim() ? nextTitle : "无标题速记" }); }} placeholder={"直接开始输入或粘贴……\n\n像备忘录一样自由记录；每条笔记独立保存，所以不会挤成一整篇。"} aria-label="私人速记内容" spellCheck={false} />
                    {extractReferenceLinks(referenceEditor.content).length > 0 && <div className="reference-document-links"><span>识别到的网址</span>{extractReferenceLinks(referenceEditor.content).map((link) => <a href={link} target="_blank" rel="noreferrer" key={link}>↗ {referenceLinkLabel(link)}</a>)}</div>}
                  </div>
                </> : <div className="reference-document-empty"><span>✎</span><h2>像备忘录一样直接写，<br />但每件事各自成页。</h2><p>左侧列表负责保持整洁；右侧是没有表单、没有分类步骤的自由编辑区。</p><button className="primary-button" onClick={createReference}>＋ 新建第一条速记</button></div>}
              </section>
            </section>
          </div>
        )}

        {view === "meals" && (
          <div className="page-content meals-page">
            <MealPlannerModule
              today={today}
              mealThemes={data.mealThemes}
              mealPlans={data.mealPlans}
              mealRecipes={data.mealRecipes}
              onChange={(change) => setData((current) => ({ ...current, ...change }))}
            />
          </div>
        )}

        {view === "wellness" && (
          <div className="page-content wellness-page">
            <FitnessModule
              today={today}
              habits={data.habits}
              trainingPlans={data.trainingPlans}
              exercises={data.exercises}
              exerciseLogs={data.exerciseLogs}
              activityLogs={data.activityLogs}
              onToggleHabit={(habitId) => setData((current) => ({ ...current, habits: current.habits.map((item) => item.id === habitId ? { ...item, done: !item.done } : item) }))}
              onChange={(change) => setData((current) => ({ ...current, ...change }))}
            />
          </div>
        )}
      </section>

      <nav className="mobile-nav" aria-label="手机主导航">
        <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}><span>⌂</span><strong>今天</strong></button>
        <button className={view === "semester" ? "active" : ""} onClick={() => setView("semester")}><span>▦</span><strong>日程</strong></button>
        <button className={view === "notes" ? "active" : ""} onClick={openNotes}><span>✎</span><strong>草稿</strong></button>
        <button className={view === "planner" ? "active" : ""} onClick={() => setView("planner")}><span>✓</span><strong>任务</strong></button>
        <button className={mobileMenuOpen || ["goals", "career", "vault", "meals", "wellness"].includes(view) ? "active" : ""} onClick={() => setMobileMenuOpen((open) => !open)} aria-expanded={mobileMenuOpen}><span>•••</span><strong>更多</strong></button>
      </nav>

      {mobileMenuOpen && <div className="mobile-more-layer">
        <button className="mobile-more-backdrop" onClick={() => setMobileMenuOpen(false)} aria-label="关闭更多功能" />
        <aside className="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="更多功能">
          <header><div><small>ALL MODULES</small><h2>更多功能</h2></div><button onClick={() => setMobileMenuOpen(false)} aria-label="关闭更多功能">×</button></header>
          <div className="mobile-more-grid">
            <button className={view === "goals" ? "active" : ""} onClick={() => { setView("goals"); setMobileMenuOpen(false); }}><span>◎</span><strong>长期目标</strong><small>管理人生主线</small></button>
            <button className={view === "career" ? "active" : ""} onClick={() => { setView("career"); setMobileMenuOpen(false); }}><span>↗</span><strong>求职记录</strong><small>跟踪投递进度</small></button>
            <button className={view === "vault" ? "active" : ""} onClick={() => { openVault(); setMobileMenuOpen(false); }}><span>⌁</span><strong>私人速记</strong><small>资料与常用信息</small></button>
            <button className={view === "meals" ? "active" : ""} onClick={() => { setView("meals"); setMobileMenuOpen(false); }}><span>食</span><strong>饮食计划</strong><small>选主题、采购与备菜</small></button>
            <button className={view === "wellness" ? "active" : ""} onClick={() => { setView("wellness"); setMobileMenuOpen(false); }}><span>＋</span><strong>健身健康</strong><small>训练、进步与动作库</small></button>
          </div>
          <div className="mobile-system-actions">
            <button onClick={() => void synchronizeData()} disabled={!online || syncStatus === "syncing"}><span className={`sync-dot ${syncStatus}`} />{syncMessage}</button>
            {!standalone && <button onClick={installMapApp}>↓ 安装 MAP App</button>}
            <button onClick={exportData}>导出 JSON 备份</button>
            <button onClick={() => importRef.current?.click()}>导入备份</button>
          </div>
        </aside>
      </div>}

      <button className={`ai-launcher ${aiOpen ? "active" : ""} ${!online ? "offline" : ""}`} onClick={toggleAIChat} aria-label={aiOpen ? "关闭 MAP AI" : "打开 MAP AI"}><span>✦</span><strong>{online ? "MAP AI" : "AI 离线"}</strong></button>
      {aiOpen && <aside className="ai-panel ai-chat-panel" aria-label="MAP AI 对话助手">
        <header><div><p className="section-kicker">YOUR LIFE · IN CONTEXT</p><h2>MAP AI</h2></div><div className="ai-header-actions"><label><span>模型</span><select value={aiModel} onChange={(event) => setAiModel(event.target.value as AIModel)} disabled={aiLoading}><option value="gpt-5.6-luna">最快 · GPT-5.6 Luna</option><option value="gpt-5.6-terra">均衡 · GPT-5.6 Terra</option><option value="gpt-5.6-sol">最强 · GPT-5.6 Sol</option><option value="gpt-5.4-mini">旧版快速 · GPT-5.4 mini</option><option value="gpt-5.4">旧版深度 · GPT-5.4</option></select></label><button onClick={closeAIChat} aria-label="关闭并清空本次对话">×</button></div></header>
        <div className="ai-quick-prompts" aria-label="快捷提问">{["分析我这周最需要注意什么", "帮我安排下周饮食和采购", "把这段职业信息加入求职看板"].map((prompt) => <button key={prompt} onClick={() => void sendAIMessage(prompt)} disabled={aiLoading || !online}>{prompt}</button>)}</div>
        <div className="ai-conversation" ref={aiConversationRef}>
          {aiMessages.map((message) => <div className={`ai-message ${message.role}`} key={message.id}><span>{message.role === "assistant" ? "✦" : "你"}</span><div><p>{message.content}</p></div></div>)}
          {aiLoading && <div className="ai-message assistant loading"><span>✦</span><div><i /><i /><i /></div></div>}
          {aiError && <p className="ai-error">{aiError}</p>}
          {aiPreview && <section className="ai-preview">
            <div className="ai-preview-head"><span>等待你确认</span><strong>尚未写入</strong></div>
            <h3>{aiPreview.summary}</h3>
            <div className="ai-change-list">{aiPreview.changes.map((change, index) => <div key={`${change}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{change}</p></div>)}</div>
            <p className="ai-confirm-note">确认后才会更新这台电脑里的 MAP 数据。你也可以继续聊天，让我调整方案。</p>
            <div className="ai-preview-actions"><button className="ghost-button" onClick={() => { setAiText("请调整这个方案："); window.requestAnimationFrame(() => aiInputRef.current?.focus()); }}>继续调整</button><button className="primary-button" onClick={applyAIPlan}>确认并应用</button></div>
          </section>}
        </div>
        <form className="ai-composer" onSubmit={(event) => { event.preventDefault(); void sendAIMessage(); }}>
          <textarea ref={aiInputRef} value={aiText} onChange={(event) => setAiText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendAIMessage(); } }} placeholder={aiVoiceState === "recording" ? "正在听…再次点击麦克风即可停止" : aiVoiceState === "transcribing" ? "正在把语音转成文字…" : online ? "问问题、做分析，或让我修改 MAP…" : "恢复网络后继续对话"} disabled={aiLoading || aiVoiceState !== "idle" || voiceTarget === "draft" || !online} />
          <button type="button" className={`voice-button ${aiVoiceState}`} onClick={() => void toggleVoiceInput("ai")} disabled={aiLoading || aiVoiceState === "transcribing" || voiceTarget === "draft" || !online} aria-label={aiVoiceState === "recording" ? "停止录音" : aiVoiceState === "transcribing" ? "正在转写语音" : "开始语音输入"}>{aiVoiceState === "recording" ? "■" : aiVoiceState === "transcribing" ? "…" : "麦"}</button>
          <button type="submit" className="ai-send-button" disabled={!aiText.trim() || aiLoading || aiVoiceState !== "idle" || voiceTarget === "draft" || !online} aria-label="发送消息">↑</button>
        </form>
        <p className="ai-privacy">普通分析不会附带私人速记；只有已开启“AI 可读 · 云端同步”的资料，才可能在你明确要求管理私人速记时发送给 OpenAI。语音会发送至 OpenAI 转写，MAP 不保存录音。</p>
      </aside>}

      {taskEditor && <TaskModal value={taskEditor} goals={data.goals} prefill={taskPrefill || undefined} sourceDraft={Boolean(promotingNoteId)} defaultDate={newTaskDate || undefined} defaultGoalId={newTaskGoalId || undefined} onClose={closeTaskEditor} onSave={saveTaskFromEditor} onDelete={taskEditor === "new" ? undefined : () => { deleteTask(taskEditor.id); closeTaskEditor(); }} />}
      {routineEditor && <RoutineModal value={routineEditor} goals={data.goals} onClose={() => setRoutineEditor(null)} onSave={saveRoutine} onDelete={routineEditor === "new" ? undefined : () => { deleteRoutine(routineEditor.id); setRoutineEditor(null); }} />}
      {phaseEditor && <PhaseModal value={data.phase} goals={data.goals} onClose={() => setPhaseEditor(false)} onSave={(phase) => { setData((current) => ({ ...current, phase })); setCalendarCursor(phase.startDate.slice(0, 7)); setPhaseEditor(false); }} />}
      {scheduleEditor && <ScheduleModal value={scheduleEditor} onClose={() => setScheduleEditor(null)} onSave={(schedule) => { setData((current) => ({ ...current, schedule: scheduleEditor === "new" ? [...current.schedule, schedule] : current.schedule.map((item) => item.id === schedule.id ? schedule : item) })); setScheduleEditor(null); }} onDelete={scheduleEditor === "new" ? undefined : () => { removeRecord("schedule", scheduleEditor.id, `已删除安排「${scheduleEditor.code}」`); setScheduleEditor(null); }} />}
      {goalEditor && <GoalModal value={goalEditor} onClose={() => setGoalEditor(null)} onSave={(goal) => { setData((current) => ({ ...current, goals: goalEditor === "new" ? [...current.goals, goal] : current.goals.map((item) => item.id === goal.id ? goal : item) })); setGoalEditor(null); }} onDelete={goalEditor === "new" ? undefined : () => { deleteGoal(goalEditor.id); setGoalEditor(null); }} />}
      {habitEditor && <HabitModal value={habitEditor} onClose={() => setHabitEditor(null)} onSave={(habit) => { setData((current) => ({ ...current, habits: habitEditor === "new" ? [...current.habits, habit] : current.habits.map((item) => item.id === habit.id ? habit : item) })); setHabitEditor(null); }} onDelete={habitEditor === "new" ? undefined : () => { removeRecord("habits", habitEditor.id, `已删除健康项目「${habitEditor.label}」`); setHabitEditor(null); }} />}
      {workoutEditor && <WorkoutModal value={workoutEditor} onClose={() => setWorkoutEditor(null)} onSave={(workout) => { setData((current) => ({ ...current, workouts: workoutEditor === "new" ? [...current.workouts, workout] : current.workouts.map((item) => item.id === workout.id ? workout : item) })); setWorkoutEditor(null); }} onDelete={workoutEditor === "new" ? undefined : () => { removeRecord("workouts", workoutEditor.id, `已删除运动「${workoutEditor.title}」`); setWorkoutEditor(null); }} />}
      {applicationEditor && <ApplicationModal value={applicationEditor} onClose={() => setApplicationEditor(null)} onSave={(application) => { setData((current) => ({ ...current, applications: applicationEditor === "new" ? [...current.applications, application] : current.applications.map((item) => item.id === application.id ? application : item) })); setApplicationEditor(null); }} onDelete={applicationEditor === "new" ? undefined : () => { removeRecord("applications", applicationEditor.id, `已删除求职记录「${applicationEditor.company}」`); setApplicationEditor(null); }} />}
      {noteEditor && <NoteModal value={noteEditor} onClose={() => setNoteEditor(null)} onSave={(note) => { setData((current) => ({ ...current, notes: current.notes.map((item) => item.id === note.id ? note : item) })); setNoteEditor(null); }} onDelete={() => { removeRecord("notes", noteEditor.id, `已删除草稿「${noteTitle(noteEditor)}」`); setNoteEditor(null); }} />}
      {installHelp && <ModalFrame title="安装 MAP 到 Mac" subtitle="OFFLINE APP" onClose={() => setInstallHelp(false)}><div className="install-guide"><p>这台浏览器没有提供一键安装按钮。你仍然可以把 MAP 安装成独立的 Mac App：</p><ol><li>使用 Safari 打开 MAP 网站。</li><li>选择菜单栏的“文件”→“添加到程序坞”。</li><li>首次联网打开一次；之后断网也能查看和编辑计划。</li></ol><p className="install-guide-note">任务、草稿、目标、课表、求职和健康会在联网后跨设备同步；私人速记只有逐条开启授权后才同步，其他资料仍只留当前设备。MAP AI 和语音转写需要联网。</p><div className="modal-actions"><button className="primary-button" onClick={() => setInstallHelp(false)}>知道了</button></div></div></ModalFrame>}
    </main>
  );
}

function NavButton({ active, label, icon, dragging, dragOver, onClick, onDragStart, onDragOver, onDrop, onDragEnd }: { active: boolean; label: string; icon: string; dragging: boolean; dragOver: boolean; onClick: () => void; onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void; onDragOver: (event: React.DragEvent<HTMLButtonElement>) => void; onDrop: (event: React.DragEvent<HTMLButtonElement>) => void; onDragEnd: () => void }) {
  return <button draggable className={`${active ? "active" : ""} ${dragging ? "dragging" : ""} ${dragOver ? "drag-over" : ""}`} onClick={onClick} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd} title="拖动改变导航顺序"><span>{icon}</span>{label}<i>{active ? "→" : "⋮⋮"}</i></button>;
}

function TaskCalendarCheck({ task, onToggle }: { task: Task; onToggle: () => void }) {
  return <button type="button" draggable={false} className={`calendar-task-check ${task.status === "done" ? "checked" : ""}`} onMouseDown={(event) => event.stopPropagation()} onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); onToggle(); }} aria-label={task.status === "done" ? `将「${task.title}」标记为未完成` : `完成「${task.title}」`}>{task.status === "done" ? "✓" : ""}</button>;
}

function RoutineCalendarCheck({ completed, label, onToggle }: { completed: boolean; label: string; onToggle: () => void }) {
  return <button type="button" draggable={false} className={`calendar-task-check routine-check ${completed ? "checked" : ""}`} onMouseDown={(event) => event.stopPropagation()} onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); onToggle(); }} aria-label={completed ? `将「${label}」标记为未完成` : `完成「${label}」`}>{completed ? "✓" : ""}</button>;
}

function RoutineTodayRow({ routine, occurrenceDate, completed, overdue, goal, onToggle, onEdit }: { routine: Routine; occurrenceDate: string; completed: boolean; overdue: boolean; goal?: Goal; onToggle: () => void; onEdit: () => void }) {
  return <div className={`task-row compact today-routine-row ${completed ? "done" : ""} ${overdue && !completed ? "overdue" : ""}`}>
    <button className="task-check" onClick={onToggle} aria-label={completed ? "标记未完成" : "标记完成"}>{completed ? "✓" : ""}</button>
    <div className="task-main"><strong>{routine.title}</strong>{routine.details && <p className="task-details">{routine.details}</p>}<span><i className={`dot ${categoryTone[routine.category]}`} />固定任务 · {routineFrequencyLabel(routine)}{goal ? <b className="task-goal-label">→ {goal.title}</b> : null}{overdue && !completed && <b className="routine-overdue">上次应做：{formatDate(occurrenceDate)}</b>}</span></div>
    <time>{routine.time || "今天"}</time><div className="task-actions"><button onClick={onEdit}>编辑规则</button></div>
  </div>;
}

function TaskRow({ task, goal, onToggle, onEdit, onDelete, compact = false }: { task: Task; goal?: Goal; onToggle: () => void; onEdit: () => void; onDelete: () => void; compact?: boolean }) {
  const carried = Boolean(task.carriedFrom) && task.status === "todo";
  return <div className={`task-row ${task.status === "done" ? "done" : ""} ${carried ? "carried" : ""} ${compact ? "compact" : ""}`}>
    <button className="task-check" onClick={onToggle} aria-label={task.status === "done" ? "标记未完成" : "标记完成"}>{task.status === "done" ? "✓" : ""}</button>
    <div className="task-main"><strong>{task.title}</strong>{task.details && <p className="task-details">{task.details}</p>}{compact && <span><i className={`dot ${categoryTone[task.category]}`} />{task.category}{goal ? <b className="task-goal-label">→ {goal.title}</b> : null}{task.endDate ? ` · 截止 ${formatDate(task.endDate)}` : ""}{carried && <b className="rollover-label">未完成顺延 · 原定 {formatDate(task.carriedFrom!)}</b>}</span>}{!compact && <span className="task-meta-line">{goal && <b className="task-goal-label">服务目标：{goal.title}</b>}{carried && <b className="rollover-meta">未完成顺延 · 原定 {formatDate(task.carriedFrom!)}</b>}</span>}</div>
    {!compact && <><span className="task-date">{formatDate(task.date)}{task.endDate ? ` → ${formatDate(task.endDate)}` : ""}{task.time ? ` · ${task.time}` : ""}</span><span className={`category-pill ${categoryTone[task.category]}`}>{task.category}</span><span className={`status-label ${carried ? "carried" : ""}`}>{task.status === "done" ? "已完成" : carried ? "未完成顺延" : task.priority === "high" ? "优先" : task.endDate ? "进行中" : "待处理"}</span></>}
    {compact && <time>{task.time || "今天"}</time>}
    <div className="task-actions"><button onClick={onEdit}>编辑</button><button onClick={onDelete}>删除</button></div>
  </div>;
}

function ModalFrame({ title, subtitle, onClose, onDelete, children }: { title: string; subtitle: string; onClose: () => void; onDelete?: () => void; children: React.ReactNode }) {
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; window.addEventListener("keydown", onKeyDown); return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); }; }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><p className="section-kicker">{subtitle}</p><h2>{title}</h2></div><button className="modal-close" onClick={onClose} aria-label={`关闭${title}`}>×</button></div>{children}<div className="modal-danger">{onDelete && <button type="button" onClick={onDelete}>删除这条记录</button>}</div></section></div>;
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) { return <label className={wide ? "wide" : ""}><span>{label}</span>{children}</label>; }

function TaskModal({ value, goals, prefill, sourceDraft = false, defaultDate, defaultGoalId, onClose, onSave, onDelete }: { value: Task | "new"; goals: Goal[]; prefill?: TaskPrefill; sourceDraft?: boolean; defaultDate?: string; defaultGoalId?: string; onClose: () => void; onSave: (task: Task) => void; onDelete?: () => void }) {
  const existing = value === "new" ? null : value;
  const titleInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleInputRef.current?.focus(); }, []);
  const [title, setTitle] = useState(existing?.title || prefill?.title || ""); const [details, setDetails] = useState(existing?.details || prefill?.details || ""); const [category, setCategory] = useState<TaskCategory>(existing?.category || prefill?.category || "生活"); const [goalId, setGoalId] = useState(existing?.goalId || defaultGoalId || ""); const [date, setDate] = useState(existing?.date || defaultDate || getTorontoToday()); const [endDate, setEndDate] = useState(existing?.endDate || ""); const [time, setTime] = useState(existing?.time || "09:00"); const [priority, setPriority] = useState<"high" | "normal">(existing?.priority || "normal");
  return <ModalFrame title={existing ? "编辑任务" : sourceDraft ? "安排这个草稿" : "新建任务"} subtitle={sourceDraft ? "DRAFT → TASK" : "TASK"} onClose={onClose} onDelete={onDelete}><form onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onSave({ id: existing?.id || uid(), title: title.trim(), details: details.trim() || null, category, goalId: goalId || null, date, time, endDate: endDate && endDate > date ? endDate : null, carriedFrom: existing && existing.date === date ? existing.carriedFrom : null, completedAt: existing?.completedAt || null, priority, status: existing?.status || "todo" }); }}><div className="form-grid"><Field label="任务名称" wide><input ref={titleInputRef} value={title} onChange={(e) => setTitle(e.target.value)} required /></Field><Field label="任务细节" wide><textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="补充地点、材料、步骤、联系人或任何执行时需要的信息……" /></Field><Field label="类别"><select value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}><option>学业</option><option>求职</option><option>生活</option><option>健康</option></select></Field><Field label="关联长期目标"><select value={goalId} onChange={(e) => setGoalId(e.target.value)}><option value="">不关联目标</option>{goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.title}</option>)}</select></Field><Field label="优先级"><select value={priority} onChange={(e) => setPriority(e.target.value as "high" | "normal")}><option value="normal">普通</option><option value="high">优先</option></select></Field><Field label="开始日期"><input type="date" value={date} onChange={(e) => { const nextDate = e.target.value; setDate(nextDate); if (endDate && endDate < nextDate) setEndDate(nextDate); }} required /></Field><Field label="结束日期（跨日任务）"><input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} /></Field><Field label="时间"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field></div>{sourceDraft && <p className="task-source-note">保存后，这条草稿会从草稿箱移除并进入正式任务；你仍然可以立即撤销。</p>}<div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" type="submit">{sourceDraft ? "安排任务" : "保存任务"}</button></div></form></ModalFrame>;
}

function RoutineModal({ value, goals, onClose, onSave, onDelete }: { value: Routine | "new"; goals: Goal[]; onClose: () => void; onSave: (routine: Routine) => void; onDelete?: () => void }) {
  const existing = value === "new" ? null : value;
  const titleInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleInputRef.current?.focus(); }, []);
  const [title, setTitle] = useState(existing?.title || "");
  const [details, setDetails] = useState(existing?.details || "");
  const [category, setCategory] = useState<TaskCategory>(existing?.category || "生活");
  const [goalId, setGoalId] = useState(existing?.goalId || "");
  const [startDate, setStartDate] = useState(existing?.startDate || getTorontoToday());
  const [time, setTime] = useState(existing?.time || "09:00");
  const [frequency, setFrequency] = useState<RoutineFrequency>(existing?.frequency || "daily");
  const [intervalDays, setIntervalDays] = useState(existing?.intervalDays || 2);
  const [active, setActive] = useState(existing?.active ?? true);
  return <ModalFrame title={existing ? "编辑固定任务" : "新建固定任务"} subtitle="RECURRING ACTION" onClose={onClose} onDelete={onDelete}><form onSubmit={(event) => { event.preventDefault(); if (!title.trim() || !startDate) return; onSave({ id: existing?.id || uid(), title: title.trim(), details: details.trim(), category, goalId: goalId || null, startDate, time: time || null, frequency, intervalDays: frequency === "daily" ? 1 : Math.max(2, Math.round(intervalDays || 2)), active, completedDates: existing?.completedDates || [] }); }}><div className="form-grid"><Field label="固定任务名称" wide><input ref={titleInputRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：刷题 3 道" required /></Field><Field label="具体要求" wide><textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="数量、标准或完成条件……" /></Field><Field label="重复频率"><select value={frequency} onChange={(event) => setFrequency(event.target.value as RoutineFrequency)}><option value="daily">每天</option><option value="interval">每隔几天</option></select></Field>{frequency === "interval" && <Field label="间隔天数"><input type="number" min="2" max="365" value={intervalDays} onChange={(event) => setIntervalDays(Number(event.target.value))} /></Field>}<Field label="开始日期"><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></Field><Field label="提醒时间"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></Field><Field label="类别"><select value={category} onChange={(event) => setCategory(event.target.value as TaskCategory)}><option>学业</option><option>求职</option><option>生活</option><option>健康</option></select></Field><Field label="关联长期目标"><select value={goalId} onChange={(event) => setGoalId(event.target.value)}><option value="">不关联目标</option>{goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.title}</option>)}</select></Field><Field label="当前状态" wide><button type="button" className={`pin-toggle ${active ? "active" : ""}`} onClick={() => setActive((current) => !current)}>{active ? "● 正在运行" : "○ 已暂停"}</button></Field></div><p className="task-source-note">每次出现都可独立打卡；修改规则不会生成重复的普通任务。</p><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存固定任务</button></div></form></ModalFrame>;
}

function PhaseModal({ value, goals, onClose, onSave }: { value: ActivePhase; goals: Goal[]; onClose: () => void; onSave: (phase: ActivePhase) => void }) {
  const [goalId, setGoalId] = useState(value.goalId || "");
  const [label, setLabel] = useState(value.label);
  const [title, setTitle] = useState(value.title);
  const [outcome, setOutcome] = useState(value.outcome);
  const [description, setDescription] = useState(value.description);
  const [startDate, setStartDate] = useState(value.startDate);
  const [endDate, setEndDate] = useState(value.endDate);
  return <ModalFrame title="编辑当前阶段" subtitle="CURRENT PHASE" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (!title.trim() || !outcome.trim() || !startDate || !endDate || endDate < startDate) return; onSave({ goalId: goalId || null, label: label.trim() || "CURRENT PHASE", title: title.trim(), outcome: outcome.trim(), description: description.trim(), startDate, endDate }); }}><div className="form-grid"><Field label="阶段标签"><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如 FALL · 2026" /></Field><Field label="关联长期目标"><select value={goalId} onChange={(event) => setGoalId(event.target.value)}><option value="">不关联目标</option>{goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.title}</option>)}</select></Field><Field label="阶段名称" wide><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如 毕业冲刺" required /></Field><Field label="这一阶段要得到的结果" wide><input value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="例如 顺利毕业、完成产品 MVP、找到新工作" required /></Field><Field label="为什么重要 / 约束条件" wide><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="说明这一阶段的重点、边界和你不想牺牲的东西。" /></Field><Field label="开始日期"><input type="date" value={startDate} onChange={(event) => { const next = event.target.value; setStartDate(next); if (endDate < next) setEndDate(next); }} required /></Field><Field label="结束日期"><input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></Field></div><p className="phase-modal-note">阶段用于决定首页倒计时、进度、时间地图范围和固定安排的显示周期。阶段结束后，直接在这里换成工作、买房、个人项目或任何下一阶段。</p><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={endDate < startDate}>保存阶段</button></div></form></ModalFrame>;
}

function NoteModal({ value, onClose, onSave, onDelete }: { value: Note; onClose: () => void; onSave: (note: Note) => void; onDelete: () => void }) {
  const [content, setContent] = useState(value.content);
  const [category, setCategory] = useState<NoteCategory>(value.category);
  const [pinned, setPinned] = useState(value.pinned);
  return <ModalFrame title="编辑草稿" subtitle="DRAFT" onClose={onClose} onDelete={onDelete}><form onSubmit={(event) => { event.preventDefault(); if (!content.trim()) return; onSave({ ...value, content: content.trim(), category, pinned, updatedAt: new Date().toISOString() }); }}><div className="form-grid"><Field label="分类"><select value={category} onChange={(event) => setCategory(event.target.value as NoteCategory)}>{NOTE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="显示顺序"><button type="button" className={`pin-toggle ${pinned ? "active" : ""}`} onClick={() => setPinned((current) => !current)}>{pinned ? "● 已置顶" : "○ 置顶这条草稿"}</button></Field><Field label="草稿内容" wide><textarea className="note-editor-area" value={content} onChange={(event) => setContent(event.target.value)} /></Field></div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={!content.trim()}>保存草稿</button></div></form></ModalFrame>;
}

function ScheduleModal({ value, onClose, onSave, onDelete }: { value: ScheduleItem | "new"; onClose: () => void; onSave: (item: ScheduleItem) => void; onDelete?: () => void }) {
  const existing = value === "new" ? null : value;
  const [code, setCode] = useState(existing?.code || ""); const [title, setTitle] = useState(existing?.title || ""); const [kind, setKind] = useState<ScheduleItem["kind"]>(existing?.kind || "课程"); const [days, setDays] = useState<string[]>(existing?.days || ["Mo"]); const [start, setStart] = useState(existing?.start || "09:00"); const [end, setEnd] = useState(existing?.end || "10:00"); const [room, setRoom] = useState(existing?.room || "");
  return <ModalFrame title={existing ? "编辑固定安排" : "添加固定安排"} subtitle="SCHEDULE" onClose={onClose} onDelete={onDelete}><form onSubmit={(e) => { e.preventDefault(); if (!days.length) return; onSave({ id: existing?.id || uid(), code, title, kind, days, start, end, room, color: existing?.color || "blue" }); }}><div className="form-grid"><Field label="简称"><input value={code} onChange={(e) => setCode(e.target.value)} required /></Field><Field label="类型"><select value={kind} onChange={(e) => setKind(e.target.value as ScheduleItem["kind"])}><option>课程</option><option>TA</option><option>个人</option></select></Field><Field label="完整名称" wide><input value={title} onChange={(e) => setTitle(e.target.value)} required /></Field><Field label="每周重复日期" wide><div className="weekday-picker" role="group" aria-label="每周重复日期">{DAY_ORDER.map((day) => <button type="button" key={day} className={days.includes(day) ? "active" : ""} aria-pressed={days.includes(day)} onClick={() => setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)))}>{DAY_LABEL[day]}</button>)}</div></Field><Field label="开始"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field><Field label="结束"><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field><Field label="地点" wide><input value={room} onChange={(e) => setRoom(e.target.value)} /></Field></div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!days.length}>保存安排</button></div></form></ModalFrame>;
}

function GoalModal({ value, onClose, onSave, onDelete }: { value: Goal | "new"; onClose: () => void; onSave: (goal: Goal) => void; onDelete?: () => void }) {
  const existing = value === "new" ? null : value; const [title, setTitle] = useState(existing?.title || ""); const [description, setDescription] = useState(existing?.description || ""); const [metric, setMetric] = useState(existing?.metric || "持续推进"); const [progress, setProgress] = useState(existing?.progress || 0);
  return <ModalFrame title={existing ? "编辑目标" : "添加目标"} subtitle="NORTH STAR" onClose={onClose} onDelete={onDelete}><form onSubmit={(e) => { e.preventDefault(); onSave({ id: existing?.id || uid(), title, description, metric, progress, tone: existing?.tone || "lavender" }); }}><div className="form-grid"><Field label="目标" wide><input value={title} onChange={(e) => setTitle(e.target.value)} required /></Field><Field label="解释" wide><textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field><Field label="节奏"><input value={metric} onChange={(e) => setMetric(e.target.value)} /></Field><Field label={`进度 · ${progress}%`}><input type="range" min="0" max="100" value={progress} onChange={(e) => setProgress(Number(e.target.value))} /></Field></div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button><button className="primary-button">保存目标</button></div></form></ModalFrame>;
}

function HabitModal({ value, onClose, onSave, onDelete }: { value: Habit | "new"; onClose: () => void; onSave: (habit: Habit) => void; onDelete?: () => void }) {
  const existing = value === "new" ? null : value; const [label, setLabel] = useState(existing?.label || ""); const [icon, setIcon] = useState(existing?.icon || "✓");
  return <ModalFrame title={existing ? "编辑饮食习惯" : "添加饮食习惯"} subtitle="HEALTH CHECK" onClose={onClose} onDelete={onDelete}><form onSubmit={(e) => { e.preventDefault(); onSave({ id: existing?.id || uid(), label, icon: icon.slice(0, 2), done: existing?.done || false }); }}><div className="form-grid"><Field label="名称" wide><input value={label} onChange={(e) => setLabel(e.target.value)} required /></Field><Field label="一字标记"><input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={2} /></Field></div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button><button className="primary-button">保存</button></div></form></ModalFrame>;
}

function WorkoutModal({ value, onClose, onSave, onDelete }: { value: Workout | "new"; onClose: () => void; onSave: (workout: Workout) => void; onDelete?: () => void }) {
  const existing = value === "new" ? null : value; const [title, setTitle] = useState(existing?.title || ""); const [day, setDay] = useState(existing?.day || "周二"); const [duration, setDuration] = useState(existing?.duration || "45 分钟");
  return <ModalFrame title={existing ? "编辑运动" : "添加运动"} subtitle="MOVEMENT" onClose={onClose} onDelete={onDelete}><form onSubmit={(e) => { e.preventDefault(); onSave({ id: existing?.id || uid(), title, day, duration, done: existing?.done || false }); }}><div className="form-grid"><Field label="运动内容" wide><input value={title} onChange={(e) => setTitle(e.target.value)} required /></Field><Field label="安排"><input value={day} onChange={(e) => setDay(e.target.value)} /></Field><Field label="时长"><input value={duration} onChange={(e) => setDuration(e.target.value)} /></Field></div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button><button className="primary-button">保存</button></div></form></ModalFrame>;
}

function ApplicationModal({ value, onClose, onSave, onDelete }: { value: Application | "new"; onClose: () => void; onSave: (application: Application) => void; onDelete?: () => void }) {
  const existing = value === "new" ? null : value; const [company, setCompany] = useState(existing?.company || ""); const [role, setRole] = useState(existing?.role || ""); const [stage, setStage] = useState<ApplicationStage>(existing?.stage || "已投"); const [link, setLink] = useState(existing?.link || ""); const [contact, setContact] = useState(existing?.contact || ""); const [date, setDate] = useState(existing?.date || getTorontoToday()); const [notes, setNotes] = useState(existing?.notes || "");
  return <ModalFrame title={existing ? "编辑求职记录" : "添加求职记录"} subtitle="APPLICATION" onClose={onClose} onDelete={onDelete}><form onSubmit={(e) => { e.preventDefault(); onSave({ id: existing?.id || uid(), company, role, stage, link, contact, date, notes }); }}><div className="form-grid"><Field label="公司"><input value={company} onChange={(e) => setCompany(e.target.value)} required /></Field><Field label="岗位"><input value={role} onChange={(e) => setRole(e.target.value)} required /></Field><Field label="阶段"><select value={stage} onChange={(e) => setStage(e.target.value as ApplicationStage)}>{APPLICATION_STAGES.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="投递日期"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="职位链接" wide><input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></Field><Field label="联系人" wide><input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="姓名、邮箱或 LinkedIn" /></Field><Field label="备注 / 下一步" wide><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="为什么值得投？下一步是什么？" /></Field></div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button>{link && <button type="button" className="ghost-button" onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>打开职位</button>}<button className="primary-button">保存记录</button></div></form></ModalFrame>;
}
