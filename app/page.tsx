"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { applyAIOperations } from "../lib/ai-operations.mjs";
import { rollOverTasks } from "../lib/task-rollover.mjs";
import { isTaskVisibleToday } from "../lib/task-visibility.mjs";

type View = "today" | "goals" | "semester" | "career" | "planner" | "notes" | "wellness";
type TaskCategory = "学业" | "求职" | "生活" | "健康";
type TaskStatus = "todo" | "done";
type NoteCategory = "课程" | "项目" | "求职" | "生活" | "想法";

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
  detail?: string;
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
type AIPlanPreview = { summary: string; changes: string[]; nextData: AppData };
type AIModel = "gpt-5.6-luna" | "gpt-5.6-terra" | "gpt-5.6-sol" | "gpt-5.4-mini" | "gpt-5.4";
type AIChatMessage = { id: string; role: "user" | "assistant"; content: string };
type AICollection = "tasks" | "schedule" | "goals" | "habits" | "workouts" | "applications" | "notes";
type AIOperation = { collection: AICollection; operation: "add" | "update" | "delete" | "reorder"; recordId: string; recordJson: string };
type AIChatResponse = { reply: string; action: "answer" | "proposal"; summary: string; operations: AIOperation[]; error?: string };
type VoiceState = "idle" | "recording" | "transcribing";
type PlannerStatusFilter = "open" | "done" | "all";
type RecordCollection = "tasks" | "schedule" | "goals" | "habits" | "workouts" | "applications" | "notes";
type UndoNotice = { message: string; restore: (current: AppData) => AppData };
type PWAInstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type AppData = {
  phase: ActivePhase;
  tasks: Task[];
  schedule: ScheduleItem[];
  goals: Goal[];
  habits: Habit[];
  workouts: Workout[];
  applications: Application[];
  notes: Note[];
  habitDate: string;
  workoutWeek: string;
};

const DAY_ORDER = ["Mo", "Tu", "We", "Th", "Fr"];
const DAY_LABEL: Record<string, string> = { Mo: "周一", Tu: "周二", We: "周三", Th: "周四", Fr: "周五" };
const CALENDAR_DAY_ORDER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const CALENDAR_DAY_LABEL = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const APPLICATION_STAGES: ApplicationStage[] = ["已投", "面试", "Offer", "拒绝"];
const NOTE_CATEGORIES: NoteCategory[] = ["想法", "课程", "项目", "求职", "生活"];
const BASE_DATE = "2026-08-23";
const STORAGE_KEY = "map-life-os-v1";
const AI_WELCOME_MESSAGE: AIChatMessage = { id: "welcome", role: "assistant", content: "你好，我是 MAP AI。我能看到你当前阶段、长期目标、任务、课表、求职记录、健康计划和全部笔记，也知道哪些任务正在服务哪个目标。你可以让我分析现状、回答问题，或者一起把一个想法变成计划；任何数据修改都会先给你预览。" };
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
  applications: [],
  notes: [],
  habitDate: getTorontoToday(),
  workoutWeek: getWeekKey(),
};

const categoryTone: Record<TaskCategory, string> = { 学业: "lime", 求职: "coral", 生活: "blue", 健康: "lavender" };

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function deriveAIChanges(current: AppData, next: AppData) {
  const collections: Array<["tasks" | "schedule" | "goals" | "habits" | "workouts" | "applications" | "notes", string]> = [["tasks", "任务"], ["schedule", "固定安排"], ["goals", "目标"], ["habits", "饮食习惯"], ["workouts", "运动"], ["applications", "求职记录"], ["notes", "笔记"]];
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

function formatShortDate(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", timeZone: "UTC" }).format(value);
}

function daysBetween(from: string, to: string) {
  return Math.ceil((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
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
  return note.content.split("\n").find((line) => line.trim())?.trim().slice(0, 80) || "无标题笔记";
}

function notePreview(note: Note) {
  const lines = note.content.split("\n").filter((line) => line.trim());
  return (lines.length > 1 ? lines.slice(1).join("\n") : note.content).trim();
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
  const [newTaskDate, setNewTaskDate] = useState<string | null>(null);
  const [newTaskGoalId, setNewTaskGoalId] = useState<string | null>(null);
  const [phaseEditor, setPhaseEditor] = useState(false);
  const [scheduleEditor, setScheduleEditor] = useState<ScheduleItem | "new" | null>(null);
  const [goalEditor, setGoalEditor] = useState<Goal | "new" | null>(null);
  const [habitEditor, setHabitEditor] = useState<Habit | "new" | null>(null);
  const [workoutEditor, setWorkoutEditor] = useState<Workout | "new" | null>(null);
  const [applicationEditor, setApplicationEditor] = useState<Application | "new" | null>(null);
  const [noteEditor, setNoteEditor] = useState<Note | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteCategory, setNoteCategory] = useState<NoteCategory>("想法");
  const [noteQuery, setNoteQuery] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiPreview, setAiPreview] = useState<AIPlanPreview | null>(null);
  const [aiMessages, setAiMessages] = useState<AIChatMessage[]>([AI_WELCOME_MESSAGE]);
  const [aiModel, setAiModel] = useState<AIModel>("gpt-5.6-luna");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [filter, setFilter] = useState<"全部" | TaskCategory>("全部");
  const [goalFilter, setGoalFilter] = useState("all");
  const [plannerStatusFilter, setPlannerStatusFilter] = useState<PlannerStatusFilter>("open");
  const [undoNotice, setUndoNotice] = useState<UndoNotice | null>(null);
  const [semesterMode, setSemesterMode] = useState<"calendar" | "week">("week");
  const [calendarCursor, setCalendarCursor] = useState(() => getTorontoToday().slice(0, 7));
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
  const aiConversationRef = useRef<HTMLDivElement>(null);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);
  const aiSessionRef = useRef(0);
  const voiceSessionRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceAbortRef = useRef<AbortController | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const todayLabel = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase();
  const phaseTiming = today < data.phase.startDate ? "before" : today > data.phase.endDate ? "after" : "active";
  const phaseDays = phaseTiming === "before" ? Math.max(0, daysBetween(today, data.phase.startDate)) : Math.max(0, daysBetween(today, data.phase.endDate));
  const phaseDuration = Math.max(1, daysBetween(data.phase.startDate, data.phase.endDate));
  const phaseProgress = Math.max(0, Math.min(100, Math.round((daysBetween(data.phase.startDate, today) / phaseDuration) * 100)));
  const phaseStops = buildPhaseStops(data.phase);
  const phaseCheckpoints = buildPhaseCheckpoints(data.phase);
  const phaseWeeks = Math.max(1, Math.ceil((phaseDuration + 1) / 7));

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    let parsed: Partial<AppData> = {};
    if (saved) try { parsed = JSON.parse(saved) as Partial<AppData>; } catch { /* keep safe defaults */ }
    const currentDay = getTorontoToday();
    const currentWeek = getWeekKey(currentDay);
    const savedHabits = parsed.habits || initialData.habits;
    const savedWorkouts = parsed.workouts || initialData.workouts;
    const savedGoals = parsed.goals || initialData.goals;
    const savedPhase = { ...initialData.phase, ...(parsed.phase || {}) };
    if (savedPhase.goalId && !savedGoals.some((goal) => goal.id === savedPhase.goalId)) savedPhase.goalId = null;
    // Hydrate device-local state after the server-rendered shell mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(currentDay);
    setData({ ...initialData, ...parsed, phase: savedPhase, tasks: normalizeTaskGoals(rollOverTasks(parsed.tasks || initialData.tasks, currentDay), savedGoals), schedule: normalizeSchedule(parsed.schedule || initialData.schedule), goals: savedGoals, habits: parsed.habitDate === currentDay ? savedHabits : savedHabits.map((habit) => ({ ...habit, done: false })), workouts: parsed.workoutWeek === currentWeek ? savedWorkouts : savedWorkouts.map((workout) => ({ ...workout, done: false })), applications: normalizeApplications(parsed.applications), notes: parsed.notes || initialData.notes, habitDate: currentDay, workoutWeek: currentWeek });
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, ready]);

  useEffect(() => {
    if (view === "notes") window.requestAnimationFrame(() => noteDraftRef.current?.focus());
  }, [view]);

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

  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);

  const todayDisplayTasks = useMemo(() => data.tasks.filter((task) => isTaskVisibleToday(task, today)), [data.tasks, today]);
  const todayTasks = useMemo(() => todayDisplayTasks.filter((task) => task.status === "todo"), [todayDisplayTasks]);
  const completedToday = todayDisplayTasks.filter((task) => task.status === "done").length;
  const taskProgress = todayTasks.length + completedToday === 0 ? 0 : Math.round((completedToday / (todayTasks.length + completedToday)) * 100);
  const workoutDone = data.workouts.filter((workout) => workout.done).length;
  const habitDone = data.habits.filter((habit) => habit.done).length;
  const calendarCells = useMemo(() => buildCalendarCells(calendarCursor), [calendarCursor]);
  const weekDays = useMemo(() => buildWeekDays(today), [today]);
  const weekStart = weekDays[0].key;
  const weekEnd = weekDays[6].key;
  const weeklyTasks = data.tasks.filter((task) => task.date <= weekEnd && (task.endDate || task.date) >= weekStart);
  const calendarMonthLabel = useMemo(() => {
    const [year, month] = calendarCursor.split("-").map(Number);
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
  }, [calendarCursor]);
  const monthStart = `${calendarCursor}-01`;
  const monthEnd = calendarCells.filter((cell) => cell.inMonth).at(-1)?.key || monthStart;
  const visibleTaskCount = data.tasks.filter((task) => task.date <= monthEnd && (task.endDate || task.date) >= monthStart).length;
  const visibleScheduleCount = calendarCells.filter((cell) => cell.inMonth && cell.key >= data.phase.startDate && cell.key <= data.phase.endDate).reduce((count, cell) => count + data.schedule.filter((item) => item.days.includes(cell.dayCode)).length, 0);
  const applicationDateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const application of data.applications) if (application.date) counts.set(application.date, (counts.get(application.date) || 0) + 1);
    return [...counts.entries()].sort(([left], [right]) => right.localeCompare(left));
  }, [data.applications]);
  const visibleApplications = applicationDateFilter === "all" ? data.applications : data.applications.filter((application) => application.date === applicationDateFilter);
  const upcomingTask = useMemo(() => data.tasks.filter((task) => task.status === "todo" && task.date > today).slice().sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99:99").localeCompare(b.time || "99:99"))[0] || null, [data.tasks, today]);
  const upcomingDate = upcomingTask ? dateCardParts(upcomingTask.date) : null;
  const courseCount = useMemo(() => new Set(data.schedule.filter((item) => item.kind === "课程").map((item) => item.code)).size, [data.schedule]);
  const taCount = data.schedule.filter((item) => item.kind === "TA").length;
  const statusFilteredTasks = useMemo(() => data.tasks.filter((task) => plannerStatusFilter === "all" || (plannerStatusFilter === "done" ? task.status === "done" : task.status === "todo")), [data.tasks, plannerStatusFilter]);
  const plannerTasks = useMemo(() => statusFilteredTasks.filter((task) => (filter === "全部" || task.category === filter) && (goalFilter === "all" || (goalFilter === "none" ? !task.goalId : task.goalId === goalFilter))).slice().sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.date.localeCompare(b.date) || (a.time || "99:99").localeCompare(b.time || "99:99")), [statusFilteredTasks, filter, goalFilter]);
  const goalById = useMemo(() => new Map(data.goals.map((goal) => [goal.id, goal])), [data.goals]);
  const goalTaskStats = useMemo(() => new Map(data.goals.map((goal) => {
    const tasks = data.tasks.filter((task) => task.goalId === goal.id);
    return [goal.id, { open: tasks.filter((task) => task.status === "todo").length, done: tasks.filter((task) => task.status === "done").length }];
  })), [data.goals, data.tasks]);
  const visibleNotes = useMemo(() => {
    const query = noteQuery.trim().toLocaleLowerCase();
    return data.notes.filter((note) => !query || note.content.toLocaleLowerCase().includes(query) || note.category.toLocaleLowerCase().includes(query)).slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  }, [data.notes, noteQuery]);

  function openNewTask(date?: string, goalId?: string) {
    setNewTaskDate(date || null);
    setNewTaskGoalId(goalId || null);
    setTaskEditor("new");
  }

  function openNotes() {
    setView("notes");
    window.requestAnimationFrame(() => noteDraftRef.current?.focus());
  }

  function saveQuickNote() {
    const content = noteDraft.trim();
    if (!content) return;
    const now = new Date().toISOString();
    setData((current) => ({ ...current, notes: [{ id: uid(), content, category: noteCategory, pinned: false, createdAt: now, updatedAt: now }, ...current.notes] }));
    setNoteDraft("");
    window.requestAnimationFrame(() => noteDraftRef.current?.focus());
  }

  function toggleTask(id: string) {
    setData((current) => ({ ...current, tasks: rollOverTasks(current.tasks.map((task) => task.id === id ? { ...task, status: task.status === "done" ? "todo" as const : "done" as const, completedAt: task.status === "done" ? null : today } : task), today) }));
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
        setData({ ...initialData, ...parsed, phase: importedPhase, goals: importedGoals, tasks: normalizeTaskGoals(rollOverTasks(parsed.tasks, today), importedGoals), schedule: normalizeSchedule(parsed.schedule), applications: normalizeApplications(parsed.applications), notes: parsed.notes || [] });
        showUndo("备份已导入", () => previous);
      } catch { window.alert("这个文件不是有效的 MAP 备份，当前数据没有改变。"); }
    };
    reader.readAsText(file);
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

  async function toggleVoiceInput() {
    if (voiceState === "recording") {
      if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
      return;
    }
    if (voiceState !== "idle" || aiLoading || !online) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setAiError("这个浏览器不支持直接录音，请使用最新版 Chrome 或 Safari。");
      return;
    }

    const session = ++voiceSessionRef.current;
    setAiError("");
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
        if (session === voiceSessionRef.current) setAiError("录音失败，请重新允许麦克风权限后再试。");
        releaseVoiceResources();
        setVoiceState("idle");
      };
      recorder.onstop = async () => {
        const chunks = voiceChunksRef.current;
        const recordedType = recorder.mimeType || mimeType || "audio/webm";
        releaseVoiceResources();
        if (session !== voiceSessionRef.current) return;
        const audio = new Blob(chunks, { type: recordedType });
        if (!audio.size) { setAiError("没有录到声音，请再试一次。"); setVoiceState("idle"); return; }
        setVoiceState("transcribing");
        const controller = new AbortController();
        voiceAbortRef.current = controller;
        try {
          const form = new FormData();
          form.append("audio", audio, recordedType.includes("mp4") ? "map-voice.mp4" : "map-voice.webm");
          const response = await fetch("/api/transcribe", { method: "POST", body: form, signal: controller.signal });
          const result = await response.json() as { text?: string; error?: string };
          if (!response.ok || !result.text) throw new Error(result.error || "语音暂时无法转写。");
          if (session !== voiceSessionRef.current) return;
          setAiText((current) => `${current}${current.trim() ? "\n" : ""}${result.text}`);
          window.requestAnimationFrame(() => aiInputRef.current?.focus());
        } catch (error) {
          if (session === voiceSessionRef.current && !(error instanceof DOMException && error.name === "AbortError")) setAiError(error instanceof Error ? error.message : "语音暂时无法转写。");
        } finally {
          if (session === voiceSessionRef.current) setVoiceState("idle");
          if (voiceAbortRef.current === controller) voiceAbortRef.current = null;
        }
      };
      recorder.start();
      setVoiceState("recording");
      voiceTimeoutRef.current = setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, 120000);
    } catch (error) {
      releaseVoiceResources();
      setVoiceState("idle");
      setAiError(error instanceof DOMException && error.name === "NotAllowedError" ? "需要允许麦克风权限才能使用语音输入。" : "无法启动麦克风，请检查浏览器权限。");
    }
  }

  function closeAIChat() {
    aiSessionRef.current += 1;
    voiceSessionRef.current += 1;
    voiceAbortRef.current?.abort();
    voiceAbortRef.current = null;
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    releaseVoiceResources();
    setVoiceState("idle");
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
      const response = await fetch("/api/ai-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: nextMessages.map(({ role, content: messageContent }) => ({ role, content: messageContent })), currentData: data, today, model: aiModel }) });
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
          schedule: normalizeSchedule(operatedData.schedule),
          applications: normalizeApplications(operatedData.applications),
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
      {!online && <div className="offline-banner"><strong>离线模式</strong><span>计划仍会保存在这台设备；MAP AI 暂停。</span></div>}
      {undoNotice && <div className="undo-toast" role="status"><span>{undoNotice.message}</span><button onClick={undoLastAction}>撤销</button></div>}
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("today")} aria-label="返回今日">
          <span className="brand-mark">M</span>
          <span><strong>MAP</strong><small>Life operating system</small></span>
        </button>

        <nav aria-label="主导航">
          <NavButton active={view === "today"} label="今日指挥台" icon="01" onClick={() => setView("today")} />
          <NavButton active={view === "goals"} label="长期目标" icon="02" onClick={() => setView("goals")} />
          <NavButton active={view === "semester"} label="阶段地图" icon="03" onClick={() => setView("semester")} />
          <NavButton active={view === "career"} label="求职记录" icon="04" onClick={() => setView("career")} />
          <NavButton active={view === "planner"} label="任务计划" icon="05" onClick={() => setView("planner")} />
          <NavButton active={view === "notes"} label="灵感笔记" icon="06" onClick={openNotes} />
          <NavButton active={view === "wellness"} label="健康运动" icon="07" onClick={() => setView("wellness")} />
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
        <p className="local-note"><span /> 数据只保存在这台设备</p>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{todayLabel}</p>
            <h1>{view === "today" ? "今天，先把最重要的事情往前推。" : view === "goals" ? "把想要的人生变成可执行路线。" : view === "semester" ? "看清当前阶段的时间与节奏。" : view === "career" ? "只投值得换掉保底的机会。" : view === "planner" ? "所有待办，一个出口。" : view === "notes" ? "先把想法接住，再慢慢整理。" : "健康不是剩余时间。"}</h1>
          </div>
          <div className="topbar-actions"><button className="quick-note-top" onClick={openNotes}><span>✎</span> 记一笔</button><button className="primary-button" onClick={() => openNewTask()}><span>＋</span> 新建任务</button></div>
        </header>

        {view === "today" && (
          <div className="page-content">
            <section className="countdown-hero">
              <div className="countdown-copy">
                <p className="section-kicker">CURRENT PHASE · {data.phase.label}</p>
                <h2>{phaseTiming === "before" ? <><span>{phaseDays}</span> 天后开始</> : phaseTiming === "active" ? <><span>{phaseDays}</span> 天后{data.phase.outcome}</> : <>设置你的<br />下一阶段</>}</h2>
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
                  <span className="counter">{todayTasks.length} 未完成</span>
                </div>
                <div className="today-progress"><span style={{ width: `${taskProgress}%` }} /></div>
                <div className="task-stack">
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
                  <button className="text-link" onClick={() => setView("wellness")}>打开健康与运动 <span>→</span></button>
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
                    <div className="goal-number">0{index + 1} · {goalPriorityLabel(index)}</div><span className="goal-drag-handle" aria-hidden="true">⋮⋮</span>
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
                  return <article draggable className={`goal-card ${goal.tone} ${draggedGoalId === goal.id ? "dragging" : ""} ${dragOverGoalId === goal.id ? "drag-over" : ""}`} key={goal.id} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", goal.id); setDraggedGoalId(goal.id); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverGoalId(goal.id); }} onDrop={(event) => { event.preventDefault(); const sourceId = event.dataTransfer.getData("text/plain") || draggedGoalId; if (sourceId) moveGoal(sourceId, goal.id); setDraggedGoalId(null); setDragOverGoalId(null); }} onDragEnd={() => { setDraggedGoalId(null); setDragOverGoalId(null); }}><div className="goal-number">0{index + 1} · {goalPriorityLabel(index)}</div><span className="goal-drag-handle" aria-hidden="true">⋮⋮</span><button className="more-button" onClick={() => setGoalEditor(goal)} aria-label={`编辑${goal.title}`}>•••</button><h3>{goal.title}</h3><p>{goal.description}</p><div className={`goal-next-step ${stats.open === 0 ? "empty" : ""}`}><span>{stats.open > 0 ? `${stats.open} 个待完成下一步` : "还没有可执行的下一步"}{stats.done > 0 ? ` · ${stats.done} 已完成` : ""}</span><button onClick={(event) => { event.stopPropagation(); openNewTask(today, goal.id); }}>＋ 添加下一步</button></div><div className="goal-footer"><span>{goal.metric}</span><strong>{goal.progress}%</strong></div><div className="goal-progress"><span style={{ width: `${goal.progress}%` }} /></div></article>;
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
              <p>周课表集中显示本周任务与固定课程；月历显示整个月的全部安排。</p>
            </div>

            {semesterMode === "calendar" ? <section className="panel calendar-panel">
              <div className="calendar-toolbar">
                <div><p className="section-kicker">CALENDAR</p><h3>{calendarMonthLabel}</h3><span>{visibleTaskCount} 项任务 · {visibleScheduleCount} 次固定安排</span></div>
                <div className="calendar-nav"><button onClick={() => setCalendarCursor((cursor) => moveMonth(cursor, -1))} aria-label="上个月">←</button><button className="calendar-today" onClick={() => setCalendarCursor(today.slice(0, 7))}>今天</button><button onClick={() => setCalendarCursor((cursor) => moveMonth(cursor, 1))} aria-label="下个月">→</button></div>
              </div>
              <div className="calendar-scroll">
                <div className="calendar-grid">
                  {CALENDAR_DAY_LABEL.map((label, index) => <div className={`calendar-weekday ${index > 4 ? "weekend" : ""}`} key={label}>{label}</div>)}
                  {calendarCells.map((cell) => {
                    const tasks = data.tasks.filter((task) => task.date <= cell.key && (task.endDate || task.date) >= cell.key).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
                    const schedules = cell.key >= data.phase.startDate && cell.key <= data.phase.endDate ? data.schedule.filter((item) => item.days.includes(cell.dayCode)).sort((a, b) => a.start.localeCompare(b.start)) : [];
                    const events = [...tasks.map((task) => ({ type: "task" as const, time: task.date === cell.key ? task.time : "", item: task })), ...schedules.map((item) => ({ type: "schedule" as const, time: item.start, item }))].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
                    return <article className={`calendar-day ${cell.inMonth ? "" : "outside"} ${cell.key === today ? "today" : ""}`} key={cell.key}>
                      <header><span>{cell.day}</span>{cell.key === today && <strong>今天</strong>}<button onClick={() => openNewTask(cell.key)} aria-label={`在 ${cell.key} 新建任务`}>＋</button></header>
                      <div className="calendar-events">
                        {events.map((event) => event.type === "task" ? <button key={`task-${event.item.id}`} className={`calendar-event task ${categoryTone[event.item.category]} ${event.item.status === "done" ? "done" : ""} ${event.item.carriedFrom && event.item.status === "todo" ? "carried" : ""}`} onClick={() => setTaskEditor(event.item)} title={`${event.item.title}${event.item.details ? ` · ${event.item.details}` : ""}${event.item.carriedFrom && event.item.status === "todo" ? ` · 未完成顺延，原定 ${formatDate(event.item.carriedFrom)}` : ""}`}><time>{event.time || (event.item.date < cell.key ? "↳" : "")}</time><span>{event.item.title}</span></button> : <button key={`schedule-${event.item.id}`} className={`calendar-event schedule ${event.item.color}`} onClick={() => setScheduleEditor(event.item)} title={`${event.item.title} · ${event.item.room}`}><time>{event.item.start}</time><span>{event.item.code}</span></button>)}
                      </div>
                    </article>;
                  })}
                </div>
              </div>
              <div className="calendar-legend"><span><i className="task" />任务</span><span><i className="schedule" />课程 / TA</span><small>长期任务会持续显示到截止日</small></div>
            </section> : <section className="panel schedule-panel">
              <div className="panel-heading"><div><p className="section-kicker">THIS WEEK</p><h3>本周安排</h3></div><span className="counter">{formatDate(weekStart)}—{formatDate(weekEnd)} · {weeklyTasks.length} 项任务</span></div>
              <div className="fixed-schedule-heading first"><div><p className="section-kicker">WEEKLY RHYTHM</p><h3>每周固定课程与 TA</h3></div><span>点击安排可编辑</span></div>
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
                        {data.schedule.filter((item) => item.days.includes(day) && (weekDays.find((weekDay) => weekDay.dayCode === day)?.key || "") >= data.phase.startDate && (weekDays.find((weekDay) => weekDay.dayCode === day)?.key || "") <= data.phase.endDate).map((item) => {
                          const top = ((timeToMinutes(item.start) - 480) / 600) * 100;
                          const height = ((timeToMinutes(item.end) - timeToMinutes(item.start)) / 600) * 100;
                          return <button key={item.id} className={`schedule-block ${item.color}`} style={{ top: `${top}%`, height: `${height}%` }} onClick={() => setScheduleEditor(item)}><strong>{item.code}</strong><span>{item.start}—{item.end}</span><small>{item.room}</small></button>;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="week-task-section">
                <div className="week-task-heading"><strong>本周任务</strong><span>点击任务编辑 · ＋ 直接安排到当天</span></div>
                <div className="week-task-scroll">
                  <div className="week-task-grid">
                    {weekDays.map((day) => {
                      const tasks = data.tasks.filter((task) => task.date <= day.key && (task.endDate || task.date) >= day.key).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
                      return <article className={`week-task-day ${day.key === today ? "today" : ""}`} key={day.key}>
                        <header><div><strong>{day.label}</strong><span>{day.date}</span></div>{day.key === today && <i>今天</i>}</header>
                        <div className="week-task-list">
                          {tasks.map((task) => <button key={task.id} className={`week-task-item ${categoryTone[task.category]} ${task.status === "done" ? "done" : ""} ${task.carriedFrom && task.status === "todo" ? "carried" : ""}`} onClick={() => setTaskEditor(task)}><time>{task.date === day.key ? task.time || "全天" : "持续"}</time><span>{task.title}{task.details && <small className="week-task-detail">{task.details}</small>}{task.carriedFrom && task.status === "todo" && <small>未完成顺延 · 原定 {formatDate(task.carriedFrom)}</small>}</span></button>)}
                          {tasks.length === 0 && <span className="week-task-empty">暂无任务</span>}
                        </div>
                        <button className="week-task-add" onClick={() => openNewTask(day.key)}>＋ 添加</button>
                      </article>;
                    })}
                  </div>
                </div>
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
            <div className="planner-toolbar">
              <div className="filter-row">{(["全部", "学业", "求职", "生活", "健康"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}<span>{item === "全部" ? statusFilteredTasks.length : statusFilteredTasks.filter((task) => task.category === item).length}</span></button>)}</div>
              <div className="planner-controls"><label className="goal-filter"><span>关联目标</span><select value={goalFilter} onChange={(event) => setGoalFilter(event.target.value)}><option value="all">全部目标</option><option value="none">未关联目标</option>{data.goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.title}</option>)}</select></label><div className="status-switch" role="group" aria-label="任务状态筛选"><button className={plannerStatusFilter === "open" ? "active" : ""} onClick={() => setPlannerStatusFilter("open")}>待处理</button><button className={plannerStatusFilter === "done" ? "active" : ""} onClick={() => setPlannerStatusFilter("done")}>已完成</button><button className={plannerStatusFilter === "all" ? "active" : ""} onClick={() => setPlannerStatusFilter("all")}>全部</button></div></div>
            </div>
            <section className="panel task-library">
              <div className="task-table-head"><span>任务</span><span>日期</span><span>类别</span><span>状态</span><span /></div>
              {plannerTasks.map((task) => <TaskRow key={task.id} task={task} goal={task.goalId ? goalById.get(task.goalId) : undefined} onToggle={() => toggleTask(task.id)} onEdit={() => setTaskEditor(task)} onDelete={() => deleteTask(task.id)} />)}
              {plannerTasks.length === 0 && <div className="empty-state">这里暂时没有符合条件的任务。</div>}
            </section>
          </div>
        )}

        {view === "notes" && (
          <div className="page-content notes-page">
            <section className="quick-note-panel">
              <div className="quick-note-intro"><p className="section-kicker">QUICK CAPTURE</p><h2>想到什么，<br />现在就写下来。</h2><p>这里不要求完整，也不要求立刻分类清楚。先记录课程项目、求职判断、出行信息或突然冒出的想法，之后再回来整理。</p></div>
              <div className="quick-note-compose">
                <textarea ref={noteDraftRef} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); saveQuickNote(); } }} placeholder={"直接开始写……\n\n例如：CAS 720 project 可以从数据库故障恢复这个方向切入，需要先查三篇 paper。"} aria-label="快速记录笔记" />
                <div className="quick-note-footer"><div className="note-category-switch" role="group" aria-label="笔记分类">{NOTE_CATEGORIES.map((category) => <button key={category} className={noteCategory === category ? "active" : ""} onClick={() => setNoteCategory(category)}>{category}</button>)}</div><div className="quick-note-save"><span>⌘ / Ctrl + Enter</span><button onClick={saveQuickNote} disabled={!noteDraft.trim()}>保存笔记 →</button></div></div>
              </div>
            </section>

            <section className="notes-library">
              <header><div><p className="section-kicker">NOTEBOOK</p><h2>所有笔记</h2><span>{data.notes.length} 条记录 · 置顶内容优先显示</span></div><label className="note-search"><span>⌕</span><input value={noteQuery} onChange={(event) => setNoteQuery(event.target.value)} placeholder="搜索内容或分类" /></label></header>
              {visibleNotes.length > 0 ? <div className="note-grid">{visibleNotes.map((note) => <article className={`note-card note-${note.category} ${note.pinned ? "pinned" : ""}`} key={note.id}>
                <div className="note-card-meta"><span>{note.category}</span><time>{formatNoteTime(note.updatedAt)}</time><div className="note-card-controls"><button className="note-pin" onClick={() => setData((current) => ({ ...current, notes: current.notes.map((item) => item.id === note.id ? { ...item, pinned: !item.pinned } : item) }))} aria-label={note.pinned ? "取消置顶" : "置顶笔记"} title={note.pinned ? "取消置顶" : "置顶"}>{note.pinned ? "●" : "○"}</button><button className="note-delete" onClick={() => removeRecord("notes", note.id, `已删除笔记「${noteTitle(note)}」`)} aria-label={`删除笔记：${noteTitle(note)}`} title="删除笔记">×</button></div></div>
                <button className="note-card-body" onClick={() => setNoteEditor(note)}><h3>{noteTitle(note)}</h3><p>{notePreview(note)}</p><span>打开编辑 <i>→</i></span></button>
              </article>)}</div> : <div className="notes-empty"><span>{noteQuery ? "没有找到匹配的笔记" : "你的第一条笔记会出现在这里"}</span><p>{noteQuery ? "换一个关键词试试。" : "不用想标题，直接在上方写下第一句话。"}</p></div>}
            </section>
          </div>
        )}

        {view === "wellness" && (
          <div className="page-content wellness-page">
            <section className="wellness-hero">
              <div><p className="section-kicker">DAILY BASELINE</p><h2>先照顾能量，<br />再管理时间。</h2><p>不追求复杂饮食记录。第一阶段只守住最影响状态的四个底线，再保证每周三次运动。</p></div>
              <div className="wellness-score"><strong>{Math.round(((habitDone + workoutDone) / Math.max(data.habits.length + data.workouts.length, 1)) * 100)}</strong><span>%</span><small>本周健康完成度</small></div>
            </section>
            <div className="wellness-columns">
              <section className="panel habit-panel">
                <div className="panel-heading"><div><p className="section-kicker">NUTRITION</p><h3>今天吃得怎么样？</h3></div><button className="ghost-button small" onClick={() => setHabitEditor("new")}>＋ 添加</button></div>
                <div className="habit-list">
                  {data.habits.map((habit) => <div className={`habit-list-row ${habit.done ? "done" : ""}`} key={habit.id}><button className="habit-check" onClick={() => setData((current) => ({ ...current, habits: current.habits.map((item) => item.id === habit.id ? { ...item, done: !item.done } : item) }))}>{habit.done ? "✓" : habit.icon}</button><span>{habit.label}</span><button className="edit-link" onClick={() => setHabitEditor(habit)}>编辑</button></div>)}
                </div>
                <p className="panel-note">饮食勾选每天自动重置；运动计划每周一自动开始新一周。</p>
              </section>
              <section className="panel workout-panel">
                <div className="panel-heading"><div><p className="section-kicker">MOVEMENT</p><h3>本周运动计划</h3></div><button className="ghost-button small" onClick={() => setWorkoutEditor("new")}>＋ 添加</button></div>
                <div className="workout-list">
                  {data.workouts.map((workout, index) => <div className={`workout-row ${workout.done ? "done" : ""}`} key={workout.id}><button className="workout-index" onClick={() => setData((current) => ({ ...current, workouts: current.workouts.map((item) => item.id === workout.id ? { ...item, done: !item.done } : item) }))}>{workout.done ? "✓" : `0${index + 1}`}</button><div><strong>{workout.title}</strong><span>{workout.day} · {workout.duration}</span></div><button className="edit-link" onClick={() => setWorkoutEditor(workout)}>编辑</button></div>)}
                </div>
                <div className="weekly-target"><span>每周目标</span><strong>{workoutDone} / {data.workouts.length}</strong><div><i style={{ width: `${Math.round((workoutDone / Math.max(data.workouts.length, 1)) * 100)}%` }} /></div></div>
              </section>
            </div>
          </div>
        )}
      </section>

      <button className={`ai-launcher ${aiOpen ? "active" : ""} ${!online ? "offline" : ""}`} onClick={toggleAIChat} aria-label={aiOpen ? "关闭 MAP AI" : "打开 MAP AI"}><span>✦</span><strong>{online ? "MAP AI" : "AI 离线"}</strong></button>
      {aiOpen && <aside className="ai-panel ai-chat-panel" aria-label="MAP AI 对话助手">
        <header><div><p className="section-kicker">YOUR LIFE · IN CONTEXT</p><h2>MAP AI</h2></div><div className="ai-header-actions"><label><span>模型</span><select value={aiModel} onChange={(event) => setAiModel(event.target.value as AIModel)} disabled={aiLoading}><option value="gpt-5.6-luna">最快 · GPT-5.6 Luna</option><option value="gpt-5.6-terra">均衡 · GPT-5.6 Terra</option><option value="gpt-5.6-sol">最强 · GPT-5.6 Sol</option><option value="gpt-5.4-mini">旧版快速 · GPT-5.4 mini</option><option value="gpt-5.4">旧版深度 · GPT-5.4</option></select></label><button onClick={closeAIChat} aria-label="关闭并清空本次对话">×</button></div></header>
        <div className="ai-quick-prompts" aria-label="快捷提问">{["分析我这周最需要注意什么", "帮我梳理当前所有课程项目", "把这段职业信息加入求职看板"].map((prompt) => <button key={prompt} onClick={() => void sendAIMessage(prompt)} disabled={aiLoading || !online}>{prompt}</button>)}</div>
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
          <textarea ref={aiInputRef} value={aiText} onChange={(event) => setAiText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendAIMessage(); } }} placeholder={voiceState === "recording" ? "正在听…再次点击麦克风即可停止" : voiceState === "transcribing" ? "正在把语音转成文字…" : online ? "问问题、做分析，或让我修改 MAP…" : "恢复网络后继续对话"} disabled={aiLoading || voiceState !== "idle" || !online} />
          <button type="button" className={`voice-button ${voiceState}`} onClick={() => void toggleVoiceInput()} disabled={aiLoading || voiceState === "transcribing" || !online} aria-label={voiceState === "recording" ? "停止录音" : voiceState === "transcribing" ? "正在转写语音" : "开始语音输入"}>{voiceState === "recording" ? "■" : voiceState === "transcribing" ? "…" : "麦"}</button>
          <button type="submit" className="ai-send-button" disabled={!aiText.trim() || aiLoading || voiceState !== "idle" || !online} aria-label="发送消息">↑</button>
        </form>
        <p className="ai-privacy">分析会读取完整 MAP；明确的数据修改只发送相关模块。语音会发送至 OpenAI 转写，MAP 不保存录音。</p>
      </aside>}

      {taskEditor && <TaskModal value={taskEditor} goals={data.goals} defaultDate={newTaskDate || undefined} defaultGoalId={newTaskGoalId || undefined} onClose={() => { setTaskEditor(null); setNewTaskDate(null); setNewTaskGoalId(null); }} onSave={(task) => { setData((current) => { const tasks = taskEditor === "new" ? [...current.tasks, task] : current.tasks.map((item) => item.id === task.id ? task : item); return { ...current, tasks: rollOverTasks(tasks, today) }; }); setTaskEditor(null); setNewTaskDate(null); setNewTaskGoalId(null); }} onDelete={taskEditor === "new" ? undefined : () => { deleteTask(taskEditor.id); setTaskEditor(null); setNewTaskDate(null); setNewTaskGoalId(null); }} />}
      {phaseEditor && <PhaseModal value={data.phase} goals={data.goals} onClose={() => setPhaseEditor(false)} onSave={(phase) => { setData((current) => ({ ...current, phase })); setCalendarCursor(phase.startDate.slice(0, 7)); setPhaseEditor(false); }} />}
      {scheduleEditor && <ScheduleModal value={scheduleEditor} onClose={() => setScheduleEditor(null)} onSave={(schedule) => { setData((current) => ({ ...current, schedule: scheduleEditor === "new" ? [...current.schedule, schedule] : current.schedule.map((item) => item.id === schedule.id ? schedule : item) })); setScheduleEditor(null); }} onDelete={scheduleEditor === "new" ? undefined : () => { removeRecord("schedule", scheduleEditor.id, `已删除安排「${scheduleEditor.code}」`); setScheduleEditor(null); }} />}
      {goalEditor && <GoalModal value={goalEditor} onClose={() => setGoalEditor(null)} onSave={(goal) => { setData((current) => ({ ...current, goals: goalEditor === "new" ? [...current.goals, goal] : current.goals.map((item) => item.id === goal.id ? goal : item) })); setGoalEditor(null); }} onDelete={goalEditor === "new" ? undefined : () => { deleteGoal(goalEditor.id); setGoalEditor(null); }} />}
      {habitEditor && <HabitModal value={habitEditor} onClose={() => setHabitEditor(null)} onSave={(habit) => { setData((current) => ({ ...current, habits: habitEditor === "new" ? [...current.habits, habit] : current.habits.map((item) => item.id === habit.id ? habit : item) })); setHabitEditor(null); }} onDelete={habitEditor === "new" ? undefined : () => { removeRecord("habits", habitEditor.id, `已删除健康项目「${habitEditor.label}」`); setHabitEditor(null); }} />}
      {workoutEditor && <WorkoutModal value={workoutEditor} onClose={() => setWorkoutEditor(null)} onSave={(workout) => { setData((current) => ({ ...current, workouts: workoutEditor === "new" ? [...current.workouts, workout] : current.workouts.map((item) => item.id === workout.id ? workout : item) })); setWorkoutEditor(null); }} onDelete={workoutEditor === "new" ? undefined : () => { removeRecord("workouts", workoutEditor.id, `已删除运动「${workoutEditor.title}」`); setWorkoutEditor(null); }} />}
      {applicationEditor && <ApplicationModal value={applicationEditor} onClose={() => setApplicationEditor(null)} onSave={(application) => { setData((current) => ({ ...current, applications: applicationEditor === "new" ? [...current.applications, application] : current.applications.map((item) => item.id === application.id ? application : item) })); setApplicationEditor(null); }} onDelete={applicationEditor === "new" ? undefined : () => { removeRecord("applications", applicationEditor.id, `已删除求职记录「${applicationEditor.company}」`); setApplicationEditor(null); }} />}
      {noteEditor && <NoteModal value={noteEditor} onClose={() => setNoteEditor(null)} onSave={(note) => { setData((current) => ({ ...current, notes: current.notes.map((item) => item.id === note.id ? note : item) })); setNoteEditor(null); }} onDelete={() => { removeRecord("notes", noteEditor.id, `已删除笔记「${noteTitle(noteEditor)}」`); setNoteEditor(null); }} />}
      {installHelp && <ModalFrame title="安装 MAP 到 Mac" subtitle="OFFLINE APP" onClose={() => setInstallHelp(false)}><div className="install-guide"><p>这台浏览器没有提供一键安装按钮。你仍然可以把 MAP 安装成独立的 Mac App：</p><ol><li>使用 Safari 打开 MAP 网站。</li><li>选择菜单栏的“文件”→“添加到程序坞”。</li><li>首次联网打开一次；之后断网也能查看和编辑计划。</li></ol><p className="install-guide-note">MAP AI 需要联网。本地任务、笔记、目标、课表、求职和健康记录不需要联网。</p><div className="modal-actions"><button className="primary-button" onClick={() => setInstallHelp(false)}>知道了</button></div></div></ModalFrame>}
    </main>
  );
}

function NavButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}><span>{icon}</span>{label}<i>→</i></button>;
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

function TaskModal({ value, goals, defaultDate, defaultGoalId, onClose, onSave, onDelete }: { value: Task | "new"; goals: Goal[]; defaultDate?: string; defaultGoalId?: string; onClose: () => void; onSave: (task: Task) => void; onDelete?: () => void }) {
  const existing = value === "new" ? null : value;
  const titleInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleInputRef.current?.focus(); }, []);
  const [title, setTitle] = useState(existing?.title || ""); const [details, setDetails] = useState(existing?.details || ""); const [category, setCategory] = useState<TaskCategory>(existing?.category || "生活"); const [goalId, setGoalId] = useState(existing?.goalId || defaultGoalId || ""); const [date, setDate] = useState(existing?.date || defaultDate || getTorontoToday()); const [endDate, setEndDate] = useState(existing?.endDate || ""); const [time, setTime] = useState(existing?.time || "09:00"); const [priority, setPriority] = useState<"high" | "normal">(existing?.priority || "normal");
  return <ModalFrame title={existing ? "编辑任务" : "新建任务"} subtitle="TASK" onClose={onClose} onDelete={onDelete}><form onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onSave({ id: existing?.id || uid(), title: title.trim(), details: details.trim() || null, category, goalId: goalId || null, date, time, endDate: endDate && endDate > date ? endDate : null, carriedFrom: existing && existing.date === date ? existing.carriedFrom : null, completedAt: existing?.completedAt || null, priority, status: existing?.status || "todo" }); }}><div className="form-grid"><Field label="任务名称" wide><input ref={titleInputRef} value={title} onChange={(e) => setTitle(e.target.value)} required /></Field><Field label="任务细节" wide><textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="补充地点、材料、步骤、联系人或任何执行时需要的信息……" /></Field><Field label="类别"><select value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}><option>学业</option><option>求职</option><option>生活</option><option>健康</option></select></Field><Field label="关联长期目标"><select value={goalId} onChange={(e) => setGoalId(e.target.value)}><option value="">不关联目标</option>{goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.title}</option>)}</select></Field><Field label="优先级"><select value={priority} onChange={(e) => setPriority(e.target.value as "high" | "normal")}><option value="normal">普通</option><option value="high">优先</option></select></Field><Field label="开始日期"><input type="date" value={date} onChange={(e) => { const nextDate = e.target.value; setDate(nextDate); if (endDate && endDate < nextDate) setEndDate(nextDate); }} required /></Field><Field label="结束日期（可选）"><input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} /></Field><Field label="时间"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field></div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存任务</button></div></form></ModalFrame>;
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
  return <ModalFrame title="编辑笔记" subtitle="NOTE" onClose={onClose} onDelete={onDelete}><form onSubmit={(event) => { event.preventDefault(); if (!content.trim()) return; onSave({ ...value, content: content.trim(), category, pinned, updatedAt: new Date().toISOString() }); }}><div className="form-grid"><Field label="分类"><select value={category} onChange={(event) => setCategory(event.target.value as NoteCategory)}>{NOTE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="显示顺序"><button type="button" className={`pin-toggle ${pinned ? "active" : ""}`} onClick={() => setPinned((current) => !current)}>{pinned ? "● 已置顶" : "○ 置顶这条笔记"}</button></Field><Field label="笔记内容" wide><textarea className="note-editor-area" value={content} onChange={(event) => setContent(event.target.value)} /></Field></div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={!content.trim()}>保存笔记</button></div></form></ModalFrame>;
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
