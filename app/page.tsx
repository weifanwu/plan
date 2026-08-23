"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type View = "today" | "goals" | "semester" | "career" | "planner" | "wellness";
type TaskCategory = "学业" | "求职" | "生活" | "健康";
type TaskStatus = "todo" | "done";

type Task = {
  id: string;
  title: string;
  category: TaskCategory;
  date: string;
  time?: string;
  endDate?: string;
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

type Habit = { id: string; label: string; done: boolean; icon: string };
type Workout = { id: string; title: string; day: string; duration: string; done: boolean };
type ApplicationStage = "已投" | "面试" | "Offer" | "拒绝";
type Application = { id: string; company: string; role: string; stage: ApplicationStage; link: string; contact: string; date: string; notes: string };
type AIPlanPreview = { summary: string; changes: string[]; nextData: AppData };

type AppData = {
  tasks: Task[];
  schedule: ScheduleItem[];
  goals: Goal[];
  habits: Habit[];
  workouts: Workout[];
  applications: Application[];
  habitDate: string;
  workoutWeek: string;
};

const DAY_ORDER = ["Mo", "Tu", "We", "Th", "Fr"];
const DAY_LABEL: Record<string, string> = { Mo: "周一", Tu: "周二", We: "周三", Th: "周四", Fr: "周五" };
const CALENDAR_DAY_ORDER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const CALENDAR_DAY_LABEL = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const APPLICATION_STAGES: ApplicationStage[] = ["已投", "面试", "Offer", "拒绝"];
const BASE_DATE = "2026-08-23";
const STORAGE_KEY = "map-life-os-v1";

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

const initialData: AppData = {
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
    { id: "stephnie", title: "解决 Stephnie 发的邮件", category: "生活", date: BASE_DATE, time: "09:00", priority: "high", status: "todo" },
    { id: "leetcode", title: "开始刷题", category: "求职", date: BASE_DATE, time: "09:00", priority: "high", status: "todo" },
    { id: "medical", title: "报销医药费", category: "生活", date: BASE_DATE, time: "09:00", priority: "high", status: "todo" },
    { id: "fees", title: "交学费和房租", category: "学业", date: BASE_DATE, time: "09:00", priority: "high", status: "todo" },
    { id: "applications", title: "开始筛选并投递更好的工作", category: "求职", date: BASE_DATE, time: "09:00", priority: "normal", status: "todo" },
    { id: "pte", title: "准备英语毕业要求并报名 PTE", category: "学业", date: BASE_DATE, time: "09:00", priority: "high", status: "todo" },
    { id: "irene", title: "给 Irene 发邮件确认上课", category: "学业", date: BASE_DATE, time: "14:00", priority: "high", status: "todo" },
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
  habitDate: getTorontoToday(),
  workoutWeek: getWeekKey(),
};

const categoryTone: Record<TaskCategory, string> = { 学业: "lime", 求职: "coral", 生活: "blue", 健康: "lavender" };

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function deriveAIChanges(current: AppData, next: AppData) {
  const collections: Array<["tasks" | "schedule" | "goals" | "habits" | "workouts" | "applications", string]> = [["tasks", "任务"], ["schedule", "固定安排"], ["goals", "目标"], ["habits", "饮食习惯"], ["workouts", "运动"], ["applications", "求职记录"]];
  const changes: string[] = [];
  const displayName = (item: Record<string, unknown>) => String(item.title || item.company || item.label || item.code || item.id || "未命名记录");
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

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export default function Home() {
  const [view, setView] = useState<View>("today");
  const [data, setData] = useState<AppData>(initialData);
  const [ready, setReady] = useState(false);
  const [taskEditor, setTaskEditor] = useState<Task | "new" | null>(null);
  const [newTaskDate, setNewTaskDate] = useState<string | null>(null);
  const [scheduleEditor, setScheduleEditor] = useState<ScheduleItem | "new" | null>(null);
  const [goalEditor, setGoalEditor] = useState<Goal | "new" | null>(null);
  const [habitEditor, setHabitEditor] = useState<Habit | "new" | null>(null);
  const [workoutEditor, setWorkoutEditor] = useState<Workout | "new" | null>(null);
  const [applicationEditor, setApplicationEditor] = useState<Application | "new" | null>(null);
  const [pasteEditor, setPasteEditor] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiPreview, setAiPreview] = useState<AIPlanPreview | null>(null);
  const [filter, setFilter] = useState<"全部" | TaskCategory>("全部");
  const [semesterMode, setSemesterMode] = useState<"calendar" | "week">("week");
  const [calendarCursor, setCalendarCursor] = useState(() => getTorontoToday().slice(0, 7));
  const [draggedApplicationId, setDraggedApplicationId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<ApplicationStage | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const today = getTorontoToday();
  const todayLabel = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase();
  const daysToGraduate = Math.max(0, Math.ceil((Date.parse("2026-12-28T12:00:00-05:00") - Date.parse(`${today}T12:00:00-05:00`)) / 86400000));
  const semesterProgress = Math.max(0, Math.min(100, Math.round(((Date.parse(`${today}T12:00:00-05:00`) - Date.parse("2026-09-01T12:00:00-04:00")) / (Date.parse("2026-12-28T12:00:00-05:00") - Date.parse("2026-09-01T12:00:00-04:00"))) * 100)));

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<AppData>;
        const currentDay = getTorontoToday();
        const currentWeek = getWeekKey(currentDay);
        const savedHabits = parsed.habits || initialData.habits;
        const savedWorkouts = parsed.workouts || initialData.workouts;
        setData({ ...initialData, ...parsed, tasks: parsed.tasks || initialData.tasks, schedule: parsed.schedule || initialData.schedule, goals: parsed.goals || initialData.goals, habits: parsed.habitDate === currentDay ? savedHabits : savedHabits.map((habit) => ({ ...habit, done: false })), workouts: parsed.workoutWeek === currentWeek ? savedWorkouts : savedWorkouts.map((workout) => ({ ...workout, done: false })), applications: normalizeApplications(parsed.applications), habitDate: currentDay, workoutWeek: currentWeek });
      } catch { /* keep safe defaults */ }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, ready]);

  const todayTasks = useMemo(() => data.tasks.filter((task) => task.date === today && task.status === "todo"), [data.tasks, today]);
  const completedToday = data.tasks.filter((task) => task.date === today && task.status === "done").length;
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
  const visibleScheduleCount = calendarCells.filter((cell) => cell.inMonth && cell.key >= "2026-09-01" && cell.key <= "2026-12-31").reduce((count, cell) => count + data.schedule.filter((item) => item.days.includes(cell.dayCode)).length, 0);

  function openNewTask(date?: string) {
    setNewTaskDate(date || null);
    setTaskEditor("new");
  }

  function toggleTask(id: string) {
    setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, status: task.status === "done" ? "todo" : "done" } : task) }));
  }

  function deleteTask(id: string) {
    setData((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id) }));
  }

  function moveApplication(id: string, stage: ApplicationStage) {
    setData((current) => ({ ...current, applications: current.applications.map((application) => application.id === id ? { ...application, stage } : application) }));
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
      try { const parsed = JSON.parse(String(reader.result)) as AppData; setData({ ...parsed, applications: normalizeApplications(parsed.applications) }); } catch { window.alert("这个备份文件无法读取。"); }
    };
    reader.readAsText(file);
  }

  async function createAIPlan() {
    if (!aiText.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError("");
    setAiPreview(null);
    try {
      const response = await fetch("/api/ai-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction: aiText.trim(), currentData: data, today }) });
      const result = await response.json() as AIPlanPreview & { error?: string };
      if (!response.ok) throw new Error(result.error || "AI 暂时无法创建计划。");
      if (!result.nextData || !Array.isArray(result.changes) || !Array.isArray(result.nextData.tasks) || !Array.isArray(result.nextData.goals)) throw new Error("AI 返回的数据格式不完整，请再试一次。");
      setAiPreview({ ...result, changes: deriveAIChanges(data, result.nextData) });
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI 暂时无法创建计划。");
    } finally {
      setAiLoading(false);
    }
  }

  function applyAIPlan() {
    if (!aiPreview) return;
    setData({ ...aiPreview.nextData, habitDate: today, workoutWeek: getWeekKey(today) });
    setAiText("");
    setAiPreview(null);
    setAiError("");
    setAiOpen(false);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("today")} aria-label="返回今日">
          <span className="brand-mark">M</span>
          <span><strong>MAP</strong><small>Life operating system</small></span>
        </button>

        <nav aria-label="主导航">
          <NavButton active={view === "today"} label="今日指挥台" icon="01" onClick={() => setView("today")} />
          <NavButton active={view === "goals"} label="长期目标" icon="02" onClick={() => setView("goals")} />
          <NavButton active={view === "semester"} label="学期地图" icon="03" onClick={() => setView("semester")} />
          <NavButton active={view === "career"} label="求职记录" icon="04" onClick={() => setView("career")} />
          <NavButton active={view === "planner"} label="任务计划" icon="05" onClick={() => setView("planner")} />
          <NavButton active={view === "wellness"} label="健康运动" icon="06" onClick={() => setView("wellness")} />
        </nav>

        <div className="sidebar-spacer" />
        <div className="semester-card">
          <div className="semester-card-top"><span>FALL · 2026</span><strong>{semesterProgress}%</strong></div>
          <div className="progress-track"><span style={{ width: `${semesterProgress}%` }} /></div>
          <p>9月1日 — 12月28日</p>
          <small>{daysToGraduate > 0 ? `距离毕业还有 ${daysToGraduate} 天` : "本学期已经结束"}</small>
        </div>
        <div className="data-tools">
          <button onClick={exportData}>导出备份</button>
          <button onClick={() => importRef.current?.click()}>导入</button>
          <input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => importData(event.target.files?.[0])} />
        </div>
        <p className="local-note"><span /> 数据只保存在这台设备</p>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{todayLabel}</p>
            <h1>{view === "today" ? "今天，先把生活拉回正轨。" : view === "goals" ? "把想要的人生变成可执行路线。" : view === "semester" ? "你的四个月毕业路线。" : view === "career" ? "只投值得换掉保底的机会。" : view === "planner" ? "所有待办，一个出口。" : "健康不是剩余时间。"}</h1>
          </div>
          <button className="primary-button" onClick={() => openNewTask()}><span>＋</span> 新建任务</button>
        </header>

        {view === "today" && (
          <div className="page-content">
            <section className="countdown-hero">
              <div className="countdown-copy">
                <p className="section-kicker">THE MAIN THING</p>
                <h2><span>{daysToGraduate}</span> 天后毕业</h2>
                <p>从 9 月 1 日开始，课程、TA、求职和身体状态都服务于同一个结果：年底稳稳完成学业，同时不把自己耗尽。</p>
                <button className="text-link" onClick={() => setView("semester")}>查看完整学期地图 <span>→</span></button>
              </div>
              <div className="route-graphic" aria-label="八月至十二月毕业路线">
                <div className="route-line" />
                {["现在", "SEP", "OCT", "NOV", "毕业"].map((label, index) => (
                  <div className={`route-stop stop-${index}`} key={label}><i>{index === 0 ? "●" : index === 4 ? "★" : ""}</i><span>{label}</span></div>
                ))}
                <div className="route-note note-one">开学</div>
                <div className="route-note note-two">期末冲刺</div>
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
                  {data.tasks.filter((task) => task.date === today).slice().sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")).map((task) => (
                    <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task.id)} onEdit={() => setTaskEditor(task)} onDelete={() => deleteTask(task.id)} compact />
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
                  <div className="next-class-date"><span>25</span><small>AUG<br />TUE</small></div>
                  <div><h3>剪头发</h3><p>14:00 · 已排入生活任务</p></div>
                </section>
              </aside>
            </div>

            <section className="goals-section">
              <div className="section-heading-row"><div><p className="section-kicker">NORTH STARS</p><h2>当前最重要的三条主线</h2></div><button className="ghost-button" onClick={() => setView("goals")}>管理长期目标</button></div>
              <div className="goal-grid">
                {data.goals.map((goal, index) => (
                  <article className={`goal-card ${goal.tone}`} key={goal.id}>
                    <div className="goal-number">0{index + 1}</div>
                    <button className="more-button" onClick={() => setGoalEditor(goal)} aria-label={`编辑${goal.title}`}>•••</button>
                    <h3>{goal.title}</h3><p>{goal.description}</p>
                    <div className="goal-footer"><span>{goal.metric}</span><strong>{goal.progress}%</strong></div>
                    <div className="goal-progress"><span style={{ width: `${goal.progress}%` }} /></div>
                  </article>
                ))}
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
              <div className="goal-grid expanded">
                {data.goals.map((goal, index) => <article className={`goal-card ${goal.tone}`} key={goal.id}><div className="goal-number">DIRECTION · 0{index + 1}</div><button className="more-button" onClick={() => setGoalEditor(goal)} aria-label={`编辑${goal.title}`}>•••</button><h3>{goal.title}</h3><p>{goal.description}</p><div className="goal-footer"><span>{goal.metric}</span><strong>{goal.progress}%</strong></div><div className="goal-progress"><span style={{ width: `${goal.progress}%` }} /></div></article>)}
                <button className="goal-add-card" onClick={() => setGoalEditor("new")}><span>＋</span><strong>添加下一条人生主线</strong><small>买房、家庭、工作、个人项目……</small></button>
              </div>
            </section>
            <section className="goal-principle"><span>原则</span><p>长期目标回答“我想把人生推向哪里”，里程碑回答“怎样知道我正在靠近”，任务只回答“下一步做什么”。</p></section>
          </div>
        )}

        {view === "semester" && (
          <div className="page-content semester-page">
            <section className="semester-summary">
              <div><p className="section-kicker">SEMESTER MAP</p><h2>Sep 01 <span>→</span> Dec 28</h2><p>3 门课 · 1 份 TA · 17 周 · 目标：毕业</p></div>
              <button className="ghost-button" onClick={() => setScheduleEditor("new")}>＋ 添加固定安排</button>
            </section>

            <div className="semester-viewbar">
              <div className="view-switch" role="group" aria-label="学期地图视图"><button className={semesterMode === "week" ? "active" : ""} onClick={() => setSemesterMode("week")}>周课表</button><button className={semesterMode === "calendar" ? "active" : ""} onClick={() => setSemesterMode("calendar")}>月历</button></div>
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
                    const schedules = cell.key >= "2026-09-01" && cell.key <= "2026-12-31" ? data.schedule.filter((item) => item.days.includes(cell.dayCode)).sort((a, b) => a.start.localeCompare(b.start)) : [];
                    const events = [...tasks.map((task) => ({ type: "task" as const, time: task.date === cell.key ? task.time : "", item: task })), ...schedules.map((item) => ({ type: "schedule" as const, time: item.start, item }))].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
                    return <article className={`calendar-day ${cell.inMonth ? "" : "outside"} ${cell.key === today ? "today" : ""}`} key={cell.key}>
                      <header><span>{cell.day}</span>{cell.key === today && <strong>今天</strong>}<button onClick={() => openNewTask(cell.key)} aria-label={`在 ${cell.key} 新建任务`}>＋</button></header>
                      <div className="calendar-events">
                        {events.map((event) => event.type === "task" ? <button key={`task-${event.item.id}`} className={`calendar-event task ${categoryTone[event.item.category]} ${event.item.status === "done" ? "done" : ""}`} onClick={() => setTaskEditor(event.item)} title={event.item.title}><time>{event.time || (event.item.date < cell.key ? "↳" : "")}</time><span>{event.item.title}</span></button> : <button key={`schedule-${event.item.id}`} className={`calendar-event schedule ${event.item.color}`} onClick={() => setScheduleEditor(event.item)} title={`${event.item.title} · ${event.item.room}`}><time>{event.item.start}</time><span>{event.item.code}</span></button>)}
                      </div>
                    </article>;
                  })}
                </div>
              </div>
              <div className="calendar-legend"><span><i className="task" />任务</span><span><i className="schedule" />课程 / TA</span><small>长期任务会持续显示到截止日</small></div>
            </section> : <section className="panel schedule-panel">
              <div className="panel-heading"><div><p className="section-kicker">THIS WEEK</p><h3>本周安排</h3></div><span className="counter">{formatDate(weekStart)}—{formatDate(weekEnd)} · {weeklyTasks.length} 项任务</span></div>
              <div className="week-task-section">
                <div className="week-task-heading"><strong>本周任务</strong><span>点击任务编辑 · ＋ 直接安排到当天</span></div>
                <div className="week-task-scroll">
                  <div className="week-task-grid">
                    {weekDays.map((day) => {
                      const tasks = data.tasks.filter((task) => task.date <= day.key && (task.endDate || task.date) >= day.key).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
                      return <article className={`week-task-day ${day.key === today ? "today" : ""}`} key={day.key}>
                        <header><div><strong>{day.label}</strong><span>{day.date}</span></div>{day.key === today && <i>今天</i>}</header>
                        <div className="week-task-list">
                          {tasks.map((task) => <button key={task.id} className={`week-task-item ${categoryTone[task.category]} ${task.status === "done" ? "done" : ""}`} onClick={() => setTaskEditor(task)}><time>{task.date === day.key ? task.time || "全天" : "持续"}</time><span>{task.title}</span></button>)}
                          {tasks.length === 0 && <span className="week-task-empty">暂无任务</span>}
                        </div>
                        <button className="week-task-add" onClick={() => openNewTask(day.key)}>＋ 添加</button>
                      </article>;
                    })}
                  </div>
                </div>
              </div>
              <div className="fixed-schedule-heading"><div><p className="section-kicker">WEEKLY RHYTHM</p><h3>每周固定课程与 TA</h3></div><span>点击安排可编辑</span></div>
              <div className="schedule-scroll">
                <div className="schedule-grid">
                  <div className="time-column"><span /><span>8 AM</span><span>10 AM</span><span>12 PM</span><span>2 PM</span><span>4 PM</span><span>6 PM</span></div>
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
            </section>}

            <section className="month-map">
              {[{ month: "SEP", title: "建立系统", text: "开学、确认课程与 TA、报名 PTE，把固定节奏跑起来。", tone: "lime" }, { month: "OCT", title: "稳住产出", text: "课程作业进入密集区，求职保持少量高质量投递。", tone: "blue" }, { month: "NOV", title: "提前收口", text: "项目与考试准备前移，不把所有风险留到十二月。", tone: "lavender" }, { month: "DEC", title: "完成毕业", text: "期末、课程收尾、材料确认，然后真正关掉这一章。", tone: "coral" }].map((item) => <article key={item.month} className={`month-card ${item.tone}`}><span>{item.month}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}
            </section>
          </div>
        )}

        {view === "career" && (
          <div className="page-content career-page">
            <section className="career-summary">
              <div><p className="section-kicker">OPPORTUNITY PIPELINE</p><h2>{data.applications.length}</h2><p>个机会正在记录 · 现有一年实习 Offer 作为保底</p></div>
              <div className="career-actions"><button className="ghost-button" onClick={() => setPasteEditor(true)}>粘贴职位信息</button><button className="primary-button" onClick={() => setApplicationEditor("new")}>＋ 添加公司</button></div>
            </section>
            <div className="pipeline-guide"><span>拖动卡片即可更新进度</span><i>已投 → 面试 → Offer / 拒绝</i></div>
            <section className="pipeline">
              {APPLICATION_STAGES.map((stage) => {
                const applications = data.applications.filter((application) => application.stage === stage);
                return <div className={`pipeline-column ${dragOverStage === stage ? "drag-over" : ""}`} key={stage} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverStage(stage); }} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain") || draggedApplicationId; if (id) moveApplication(id, stage); setDraggedApplicationId(null); setDragOverStage(null); }}><header><strong>{stage}</strong><span>{applications.length}</span></header><div className="pipeline-stack">{applications.map((application) => <button draggable className={`application-card ${draggedApplicationId === application.id ? "dragging" : ""}`} key={application.id} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", application.id); setDraggedApplicationId(application.id); }} onDragEnd={() => { setDraggedApplicationId(null); setDragOverStage(null); }} onClick={() => setApplicationEditor(application)}><span className="company-initial">{application.company.slice(0, 1).toUpperCase()}</span><strong>{application.company}</strong><p>{application.role}</p>{application.date && <small>{formatDate(application.date)}</small>}<i className="drag-handle" aria-hidden="true">⋮⋮</i></button>)}<button className="pipeline-add" onClick={() => setApplicationEditor("new")}>＋ 添加</button></div></div>;
              })}
            </section>
            {data.applications.length === 0 && <section className="career-empty"><span>先从一个值得关注的公司开始</span><h3>不用海投。把真正比现有 Offer 更好的机会留下来，持续推进。</h3><button className="text-link" onClick={() => setPasteEditor(true)}>粘贴一段职位信息快速创建 →</button></section>}
          </div>
        )}

        {view === "planner" && (
          <div className="page-content planner-page">
            <div className="planner-toolbar">
              <div className="filter-row">{(["全部", "学业", "求职", "生活", "健康"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}<span>{item === "全部" ? data.tasks.length : data.tasks.filter((task) => task.category === item).length}</span></button>)}</div>
              <button className="primary-button" onClick={() => openNewTask()}>＋ 新建任务</button>
            </div>
            <section className="panel task-library">
              <div className="task-table-head"><span>任务</span><span>日期</span><span>类别</span><span>状态</span><span /></div>
              {data.tasks.filter((task) => filter === "全部" || task.category === filter).slice().sort((a, b) => a.date.localeCompare(b.date)).map((task) => <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task.id)} onEdit={() => setTaskEditor(task)} onDelete={() => deleteTask(task.id)} />)}
              {data.tasks.filter((task) => filter === "全部" || task.category === filter).length === 0 && <div className="empty-state">这个分类还没有任务。</div>}
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

      <button className={`ai-launcher ${aiOpen ? "active" : ""}`} onClick={() => setAiOpen((open) => !open)} aria-label={aiOpen ? "关闭 MAP AI" : "打开 MAP AI"}><span>✦</span><strong>MAP AI</strong></button>
      {aiOpen && <aside className="ai-panel" aria-label="MAP AI 计划助手">
        <header><div><p className="section-kicker">INTENT → PLAN</p><h2>告诉我你想怎么安排。</h2></div><button onClick={() => setAiOpen(false)} aria-label="关闭">×</button></header>
        {!aiPreview ? <>
          <p className="ai-intro">直接粘贴课程通知、职位描述、旅行安排，或者用一句话告诉我你想新增、修改或删除什么。</p>
          <div className="ai-prompts">
            {["把这周的待办按优先级安排好", "明天下午安排一次 45 分钟力量训练", "把这段职位信息加入求职看板"].map((prompt) => <button key={prompt} onClick={() => setAiText(prompt)}>{prompt}</button>)}
          </div>
          <textarea value={aiText} onChange={(event) => setAiText(event.target.value)} placeholder="例如：下周一开始，每周一三五晚上 7 点刷题一小时；再加一个目标，年底前完成 100 道题……" autoFocus />
          {aiError && <p className="ai-error">{aiError}</p>}
          <p className="ai-privacy">发送时，这段文字和当前计划数据会传给 OpenAI。API key 只在服务端使用，不会进入浏览器。</p>
          <button className="ai-submit" onClick={createAIPlan} disabled={!aiText.trim() || aiLoading}>{aiLoading ? <><i /> 正在整理你的计划…</> : <>生成修改预览 <span>→</span></>}</button>
        </> : <div className="ai-preview">
          <div className="ai-preview-mark">✓</div>
          <p className="section-kicker">READY TO APPLY</p>
          <h3>{aiPreview.summary}</h3>
          <div className="ai-change-list">{aiPreview.changes.map((change, index) => <div key={`${change}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{change}</p></div>)}</div>
          <p className="ai-confirm-note">这些改动尚未写入。确认后才会更新当前电脑里的 MAP 数据。</p>
          <div className="ai-preview-actions"><button className="ghost-button" onClick={() => setAiPreview(null)}>返回修改</button><button className="primary-button" onClick={applyAIPlan}>确认并应用</button></div>
        </div>}
      </aside>}

      {taskEditor && <TaskModal value={taskEditor} defaultDate={newTaskDate || undefined} onClose={() => { setTaskEditor(null); setNewTaskDate(null); }} onSave={(task) => { setData((current) => ({ ...current, tasks: taskEditor === "new" ? [...current.tasks, task] : current.tasks.map((item) => item.id === task.id ? task : item) })); setTaskEditor(null); setNewTaskDate(null); }} onDelete={taskEditor === "new" ? undefined : () => { deleteTask(taskEditor.id); setTaskEditor(null); setNewTaskDate(null); }} />}
      {scheduleEditor && <ScheduleModal value={scheduleEditor} onClose={() => setScheduleEditor(null)} onSave={(schedule) => { setData((current) => ({ ...current, schedule: scheduleEditor === "new" ? [...current.schedule, schedule] : current.schedule.map((item) => item.id === schedule.id ? schedule : item) })); setScheduleEditor(null); }} onDelete={scheduleEditor === "new" ? undefined : () => { setData((current) => ({ ...current, schedule: current.schedule.filter((item) => item.id !== scheduleEditor.id) })); setScheduleEditor(null); }} />}
      {goalEditor && <GoalModal value={goalEditor} onClose={() => setGoalEditor(null)} onSave={(goal) => { setData((current) => ({ ...current, goals: goalEditor === "new" ? [...current.goals, goal] : current.goals.map((item) => item.id === goal.id ? goal : item) })); setGoalEditor(null); }} onDelete={goalEditor === "new" ? undefined : () => { setData((current) => ({ ...current, goals: current.goals.filter((item) => item.id !== goalEditor.id) })); setGoalEditor(null); }} />}
      {habitEditor && <HabitModal value={habitEditor} onClose={() => setHabitEditor(null)} onSave={(habit) => { setData((current) => ({ ...current, habits: habitEditor === "new" ? [...current.habits, habit] : current.habits.map((item) => item.id === habit.id ? habit : item) })); setHabitEditor(null); }} onDelete={habitEditor === "new" ? undefined : () => { setData((current) => ({ ...current, habits: current.habits.filter((item) => item.id !== habitEditor.id) })); setHabitEditor(null); }} />}
      {workoutEditor && <WorkoutModal value={workoutEditor} onClose={() => setWorkoutEditor(null)} onSave={(workout) => { setData((current) => ({ ...current, workouts: workoutEditor === "new" ? [...current.workouts, workout] : current.workouts.map((item) => item.id === workout.id ? workout : item) })); setWorkoutEditor(null); }} onDelete={workoutEditor === "new" ? undefined : () => { setData((current) => ({ ...current, workouts: current.workouts.filter((item) => item.id !== workoutEditor.id) })); setWorkoutEditor(null); }} />}
      {applicationEditor && <ApplicationModal value={applicationEditor} onClose={() => setApplicationEditor(null)} onSave={(application) => { setData((current) => ({ ...current, applications: applicationEditor === "new" ? [...current.applications, application] : current.applications.map((item) => item.id === application.id ? application : item) })); setApplicationEditor(null); }} onDelete={applicationEditor === "new" ? undefined : () => { setData((current) => ({ ...current, applications: current.applications.filter((item) => item.id !== applicationEditor.id) })); setApplicationEditor(null); }} />}
      {pasteEditor && <PasteApplicationModal onClose={() => setPasteEditor(false)} onCreate={(application) => { setData((current) => ({ ...current, applications: [...current.applications, application] })); setPasteEditor(false); setApplicationEditor(application); }} />}
    </main>
  );
}

function NavButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}><span>{icon}</span>{label}<i>→</i></button>;
}

function TaskRow({ task, onToggle, onEdit, onDelete, compact = false }: { task: Task; onToggle: () => void; onEdit: () => void; onDelete: () => void; compact?: boolean }) {
  return <div className={`task-row ${task.status === "done" ? "done" : ""} ${compact ? "compact" : ""}`}>
    <button className="task-check" onClick={onToggle} aria-label={task.status === "done" ? "标记未完成" : "标记完成"}>{task.status === "done" ? "✓" : ""}</button>
    <div className="task-main"><strong>{task.title}</strong>{compact && <span><i className={`dot ${categoryTone[task.category]}`} />{task.category}{task.endDate ? ` · 截止 ${formatDate(task.endDate)}` : ""}</span>}</div>
    {!compact && <><span className="task-date">{formatDate(task.date)}{task.time ? ` · ${task.time}` : ""}</span><span className={`category-pill ${categoryTone[task.category]}`}>{task.category}</span><span className="status-label">{task.status === "done" ? "已完成" : task.priority === "high" ? "优先" : "待处理"}</span></>}
    {compact && <time>{task.time || "今天"}</time>}
    <div className="task-actions"><button onClick={onEdit}>编辑</button><button onClick={onDelete}>删除</button></div>
  </div>;
}

function ModalFrame({ title, subtitle, onClose, onDelete, children }: { title: string; subtitle: string; onClose: () => void; onDelete?: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><p className="section-kicker">{subtitle}</p><h2>{title}</h2></div><button className="modal-close" onClick={onClose}>×</button></div>{children}<div className="modal-danger">{onDelete && <button type="button" onClick={onDelete}>删除这条记录</button>}</div></section></div>;
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) { return <label className={wide ? "wide" : ""}><span>{label}</span>{children}</label>; }

function TaskModal({ value, defaultDate, onClose, onSave, onDelete }: { value: Task | "new"; defaultDate?: string; onClose: () => void; onSave: (task: Task) => void; onDelete?: () => void }) {
  const existing = value === "new" ? null : value;
  const [title, setTitle] = useState(existing?.title || ""); const [category, setCategory] = useState<TaskCategory>(existing?.category || "生活"); const [date, setDate] = useState(existing?.date || defaultDate || getTorontoToday()); const [time, setTime] = useState(existing?.time || "09:00"); const [priority, setPriority] = useState<"high" | "normal">(existing?.priority || "normal");
  return <ModalFrame title={existing ? "编辑任务" : "新建任务"} subtitle="TASK" onClose={onClose} onDelete={onDelete}><form onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onSave({ id: existing?.id || uid(), title: title.trim(), category, date, time, endDate: existing?.endDate, priority, status: existing?.status || "todo" }); }}><div className="form-grid"><Field label="任务名称" wide><input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required /></Field><Field label="类别"><select value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}><option>学业</option><option>求职</option><option>生活</option><option>健康</option></select></Field><Field label="优先级"><select value={priority} onChange={(e) => setPriority(e.target.value as "high" | "normal")}><option value="normal">普通</option><option value="high">优先</option></select></Field><Field label="日期"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field><Field label="时间"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field></div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存任务</button></div></form></ModalFrame>;
}

function ScheduleModal({ value, onClose, onSave, onDelete }: { value: ScheduleItem | "new"; onClose: () => void; onSave: (item: ScheduleItem) => void; onDelete?: () => void }) {
  const existing = value === "new" ? null : value;
  const [code, setCode] = useState(existing?.code || ""); const [title, setTitle] = useState(existing?.title || ""); const [kind, setKind] = useState<ScheduleItem["kind"]>(existing?.kind || "课程"); const [days, setDays] = useState(existing?.days.join(",") || "Mo"); const [start, setStart] = useState(existing?.start || "09:00"); const [end, setEnd] = useState(existing?.end || "10:00"); const [room, setRoom] = useState(existing?.room || "");
  return <ModalFrame title={existing ? "编辑固定安排" : "添加固定安排"} subtitle="SCHEDULE" onClose={onClose} onDelete={onDelete}><form onSubmit={(e) => { e.preventDefault(); onSave({ id: existing?.id || uid(), code, title, kind, days: days.split(",").map((d) => d.trim()).filter((d) => DAY_ORDER.includes(d)), start, end, room, color: existing?.color || "blue" }); }}><div className="form-grid"><Field label="简称"><input value={code} onChange={(e) => setCode(e.target.value)} required /></Field><Field label="类型"><select value={kind} onChange={(e) => setKind(e.target.value as ScheduleItem["kind"])}><option>课程</option><option>TA</option><option>个人</option></select></Field><Field label="完整名称" wide><input value={title} onChange={(e) => setTitle(e.target.value)} required /></Field><Field label="星期代码（逗号分隔）" wide><input value={days} onChange={(e) => setDays(e.target.value)} placeholder="Mo,We,Fr" /></Field><Field label="开始"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field><Field label="结束"><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field><Field label="地点" wide><input value={room} onChange={(e) => setRoom(e.target.value)} /></Field></div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button><button className="primary-button">保存安排</button></div></form></ModalFrame>;
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
  return <ModalFrame title={existing ? "编辑求职记录" : "添加求职记录"} subtitle="APPLICATION" onClose={onClose} onDelete={onDelete}><form onSubmit={(e) => { e.preventDefault(); onSave({ id: existing?.id || uid(), company, role, stage, link, contact, date, notes }); }}><div className="form-grid"><Field label="公司"><input value={company} onChange={(e) => setCompany(e.target.value)} required /></Field><Field label="岗位"><input value={role} onChange={(e) => setRole(e.target.value)} required /></Field><Field label="阶段"><select value={stage} onChange={(e) => setStage(e.target.value as ApplicationStage)}>{APPLICATION_STAGES.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="记录日期"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="职位链接" wide><input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></Field><Field label="联系人" wide><input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="姓名、邮箱或 LinkedIn" /></Field><Field label="备注 / 下一步" wide><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="为什么值得投？下一步是什么？" /></Field></div><div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>取消</button>{link && <button type="button" className="ghost-button" onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>打开职位</button>}<button className="primary-button">保存记录</button></div></form></ModalFrame>;
}

function PasteApplicationModal({ onClose, onCreate }: { onClose: () => void; onCreate: (application: Application) => void }) {
  const [raw, setRaw] = useState("");
  function parse() {
    const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
    const url = raw.match(/https?:\/\/[^\s]+/)?.[0] || "";
    const clean = lines.filter((line) => !line.startsWith("http"));
    onCreate({ id: uid(), company: clean[0]?.slice(0, 80) || "待填写公司", role: clean[1]?.slice(0, 120) || "待填写岗位", stage: "已投", link: url, contact: "", date: getTorontoToday(), notes: raw.slice(0, 2500) });
  }
  return <ModalFrame title="粘贴职位信息" subtitle="QUICK CAPTURE" onClose={onClose}><div className="paste-explainer">把 LinkedIn、公司官网或聊天里的职位信息直接贴进来。首版会提取前两行和链接，再打开完整表单让你确认；不会上传任何内容。</div><textarea className="paste-area" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={"Company name\nRole title\nhttps://company.com/job\n其他职位描述……"} autoFocus /><div className="modal-actions"><button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" onClick={parse} disabled={!raw.trim()}>提取并继续</button></div></ModalFrame>;
}
