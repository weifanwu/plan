"use client";

import { useMemo, useState } from "react";
import type { ActivityLog, ExerciseDefinition, ExerciseLog, FitnessHabit, LoadMode, TrainingPlan, WeightUnit } from "@/lib/fitness-types";

type FitnessTab = "today" | "week" | "progress" | "library";
type Props = {
  today: string;
  habits: FitnessHabit[];
  trainingPlans: TrainingPlan[];
  exercises: ExerciseDefinition[];
  exerciseLogs: ExerciseLog[];
  activityLogs: ActivityLog[];
  onToggleHabit: (id: string) => void;
  onChange: (change: Partial<Pick<Props, "trainingPlans" | "exercises" | "exerciseLogs" | "activityLogs">>) => void;
};

const DAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const MONDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const BODY_PARTS: ExerciseDefinition["bodyPart"][] = ["胸部", "背部", "肩部", "二头", "三头", "腹部", "腿部", "有氧与活动"];
const ACTIVITY_TYPES = ["散步", "快走", "跑步", "篮球", "徒步 Hiking", "骑车", "游泳", "拉伸", "其他"];
const LOAD_LABEL: Record<LoadMode, string> = { weight: "器械 / 哑铃重量", bodyweight: "自重", assisted: "辅助重量", added: "额外负重" };

function id(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function utcDate(value: string) { return new Date(`${value}T12:00:00Z`); }
function dateKey(value: Date) { return value.toISOString().slice(0, 10); }
function shortDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", timeZone: "UTC" }).format(utcDate(value)); }
function weekDates(today: string) {
  const anchor = utcDate(today);
  const mondayOffset = (anchor.getUTCDay() + 6) % 7;
  anchor.setUTCDate(anchor.getUTCDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => { const date = new Date(anchor); date.setUTCDate(date.getUTCDate() + index); return dateKey(date); });
}
function formatLoad(weight: number | null, unit: WeightUnit, mode: LoadMode) {
  if (mode === "bodyweight") return "自重";
  if (weight == null) return mode === "assisted" ? "辅助重量待记录" : "重量待记录";
  return `${mode === "assisted" ? "辅助 " : mode === "added" ? "+" : ""}${weight} ${unit}`;
}
function kindLabel(kind: TrainingPlan["kind"]) { return ({ strength: "力量", cardio: "有氧", recovery: "恢复", flex: "自由" } as const)[kind]; }

export default function FitnessModule(props: Props) {
  const { today, habits, trainingPlans, exercises, exerciseLogs, activityLogs, onToggleHabit, onChange } = props;
  const [tab, setTab] = useState<FitnessTab>("today");
  const [planEditor, setPlanEditor] = useState<TrainingPlan | null>(null);
  const [sessionPlan, setSessionPlan] = useState<TrainingPlan | null>(null);
  const [activityEditor, setActivityEditor] = useState<ActivityLog | "new" | null>(null);
  const [exerciseEditor, setExerciseEditor] = useState<ExerciseDefinition | "new" | null>(null);
  const [historyExerciseId, setHistoryExerciseId] = useState<string | null>(null);
  const [logEditor, setLogEditor] = useState<ExerciseLog | "new" | null>(null);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [bodyPart, setBodyPart] = useState<"全部" | ExerciseDefinition["bodyPart"]>("全部");
  const week = useMemo(() => weekDates(today), [today]);
  const weekSet = useMemo(() => new Set(week), [week]);
  const todayWeekday = utcDate(today).getUTCDay();
  const todayPlan = trainingPlans.find((plan) => plan.active && plan.weekday === todayWeekday) || null;
  const todayCompletion = todayPlan ? activityLogs.find((log) => log.date === today && log.planId === todayPlan.id) : null;
  const weekActivities = activityLogs.filter((log) => weekSet.has(log.date));
  const weekExerciseLogs = exerciseLogs.filter((log) => weekSet.has(log.date));
  const activeDays = new Set([...weekActivities.map((log) => log.date), ...weekExerciseLogs.map((log) => log.date)]).size;
  const totalMinutes = weekActivities.reduce((sum, log) => sum + log.durationMinutes, 0);
  const habitDone = habits.filter((habit) => habit.done).length;
  const exerciseById = useMemo(() => new Map(exercises.map((item) => [item.id, item])), [exercises]);
  const visibleExercises = useMemo(() => {
    const query = libraryQuery.trim().toLocaleLowerCase();
    return exercises.filter((item) => (bodyPart === "全部" || item.bodyPart === bodyPart) && (!query || `${item.name} ${item.notes} ${item.bodyPart}`.toLocaleLowerCase().includes(query)));
  }, [bodyPart, exercises, libraryQuery]);

  const saveExerciseLog = (log: ExerciseLog) => {
    const nextLogs = logEditor === "new" ? [...exerciseLogs, log] : exerciseLogs.map((item) => item.id === log.id ? log : item);
    const otherDates = exerciseLogs.filter((item) => item.exerciseId === log.exerciseId && item.id !== log.id).map((item) => item.date);
    const isLatest = otherDates.length === 0 || log.date >= otherDates.sort().at(-1)!;
    const nextExercises = exercises.map((item) => item.id === log.exerciseId && log.weight != null && isLatest ? { ...item, currentWeight: log.weight, unit: log.unit, loadMode: log.loadMode } : item);
    onChange({ exerciseLogs: nextLogs, exercises: nextExercises });
    setLogEditor(null);
  };

  return <div className="fitness-shell">
    <section className="fitness-hero">
      <div><p className="section-kicker">FITNESS & HEALTH</p><h2>练得久，比练得狠更重要。</h2><p>每次最多 40 分钟。力量、有氧、散步和休息都算真实生活的一部分。</p></div>
      <div className="fitness-week-snapshot"><span>本周</span><strong>{activeDays}</strong><small>个活动日 · {totalMinutes} 分钟</small></div>
    </section>

    <nav className="fitness-tabs" aria-label="健身与健康视图">
      {([['today', '今日'], ['week', '本周'], ['progress', '进步'], ['library', '动作库']] as Array<[FitnessTab, string]>).map(([value, label]) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}
    </nav>

    {tab === "today" && <div className="fitness-today-grid">
      <section className={`fitness-today-plan ${todayCompletion ? "complete" : ""}`}>
        <header><div><p className="section-kicker">TODAY · {DAY_NAMES[todayWeekday]}</p><h3>{todayPlan?.title || "今天没有固定训练"}</h3></div><span>{todayCompletion ? "已完成" : todayPlan?.kind === "recovery" ? "可休息" : "未开始"}</span></header>
        {todayPlan ? <>
          <div className="fitness-duration"><strong>{todayPlan.durationMinutes}</strong><span>分钟</span><small>上限 {todayPlan.maxMinutes} 分钟</small></div>
          {todayPlan.kind === "strength" && <div className="fitness-time-split"><span style={{ flex: todayPlan.warmupMinutes }}>热身 {todayPlan.warmupMinutes}</span><span style={{ flex: todayPlan.strengthMinutes }}>力量 {todayPlan.strengthMinutes}</span><span style={{ flex: todayPlan.cardioMinutes }}>有氧 {todayPlan.cardioMinutes}</span></div>}
          <div className="fitness-today-exercises">{todayPlan.exerciseIds.map((exerciseId) => <span key={exerciseId}>{exerciseById.get(exerciseId)?.name || "已删除动作"}</span>)}</div>
          <p className="fitness-plan-note">{todayPlan.notes}</p>
          <div className="fitness-primary-actions"><button className="primary-button" onClick={() => setSessionPlan(todayPlan)}>{todayCompletion ? "再记录一次" : todayPlan.kind === "recovery" ? "记录散步 / 恢复" : "开始并记录训练"}</button><button className="ghost-button" onClick={() => setPlanEditor(todayPlan)}>调整今天的计划</button></div>
        </> : <div className="fitness-rest-empty"><span>○</span><p>空白日也正常。你可以休息，或只记录一次散步。</p></div>}
        <button className="fitness-quick-activity" onClick={() => setActivityEditor("new")}>＋ 记录其他运动</button>
      </section>

      <aside className="fitness-side-stack">
        <section className="fitness-card nutrition-card"><header><div><p className="section-kicker">SIMPLE NUTRITION</p><h3>今天吃得怎么样</h3></div><strong>{habitDone}/{habits.length}</strong></header><div className="fitness-habits">{habits.map((habit) => <button key={habit.id} className={habit.done ? "done" : ""} onClick={() => onToggleHabit(habit.id)}><span>{habit.icon}</span><strong>{habit.label}</strong><i>{habit.done ? "✓" : "+"}</i></button>)}</div></section>
        <section className="fitness-card weekly-health-card"><header><div><p className="section-kicker">THIS WEEK</p><h3>不用追连续打卡</h3></div></header><div className="fitness-week-numbers"><div><strong>{activeDays}</strong><span>活动日</span></div><div><strong>{weekActivities.length}</strong><span>运动记录</span></div><div><strong>{totalMinutes}</strong><span>总分钟</span></div></div><p>休息、跳过或改期都不会中断任何 streak；系统只记录你真正做过什么。</p></section>
      </aside>
    </div>}

    {tab === "week" && <div className="fitness-week-view">
      <div className="fitness-section-head"><div><p className="section-kicker">WEEKLY PLAN</p><h2>本周训练安排</h2><span>{shortDate(week[0])}—{shortDate(week[6])} · 每一天都可以改</span></div><button className="ghost-button" onClick={() => setActivityEditor("new")}>＋ 记录运动</button></div>
      <div className="fitness-week-strip">{MONDAY_ORDER.map((weekday, index) => {
        const date = week[index]; const plan = trainingPlans.find((item) => item.weekday === weekday); const done = plan && activityLogs.some((log) => log.date === date && log.planId === plan.id);
        return <article key={weekday} className={`${date === today ? "today" : ""} ${done ? "done" : ""}`}><header><span>{DAY_NAMES[weekday]}</span><small>{shortDate(date)}</small></header>{plan ? <><i>{kindLabel(plan.kind)}</i><h3>{plan.title}</h3><p>{plan.durationMinutes} 分钟 · {plan.exerciseIds.length ? `${plan.exerciseIds.length} 个动作` : "自由调整"}</p><div><button onClick={() => setSessionPlan(plan)}>{done ? "再记一次" : "记录"}</button><button onClick={() => setPlanEditor(plan)}>编辑</button></div></> : <button className="fitness-add-plan" onClick={() => setPlanEditor({ id: id("plan"), title: "新的训练", weekday, kind: "flex", durationMinutes: 30, maxMinutes: 40, exerciseIds: [], warmupMinutes: 0, strengthMinutes: 0, cardioMinutes: 30, notes: "", active: true })}>＋ 安排</button>}</article>;
      })}</div>
      <section className="fitness-card fitness-history"><header><div><p className="section-kicker">ACTIVITY LOG</p><h3>最近的运动</h3></div><strong>{weekActivities.length} 条</strong></header>{weekActivities.length ? <div>{weekActivities.slice().sort((a, b) => b.date.localeCompare(a.date)).map((log) => <button key={log.id} onClick={() => setActivityEditor(log)}><time>{shortDate(log.date)}</time><span><strong>{log.type}</strong><small>{log.durationMinutes} 分钟{log.distance != null ? ` · ${log.distance} ${log.distanceUnit}` : ""}{log.intensity ? ` · ${log.intensity}` : ""}</small></span><i>编辑</i></button>)}</div> : <p className="fitness-empty-copy">本周还没有运动记录。散步、篮球和徒步都可以记。</p>}</section>
    </div>}

    {tab === "progress" && <div className="fitness-progress-view">
      <div className="fitness-section-head"><div><p className="section-kicker">PROGRESS, NOT PRESSURE</p><h2>力量与运动趋势</h2><span>当前工作重量是你能稳定完成规定次数的重量，不是 1RM。</span></div><button className="ghost-button" onClick={() => setLogEditor("new")}>＋ 补记力量</button></div>
      <div className="fitness-progress-grid">{exercises.filter((item) => item.currentWeight != null || exerciseLogs.some((log) => log.exerciseId === item.id)).map((item) => {
        const logs = exerciseLogs.filter((log) => log.exerciseId === item.id).slice().sort((a, b) => a.date.localeCompare(b.date));
        const latest = logs.at(-1); const earliestComparable = logs.find((log) => log.weight != null && log.unit === (latest?.unit || item.unit));
        const delta = latest?.weight != null && earliestComparable?.weight != null ? latest.weight - earliestComparable.weight : null;
        const weights = logs.flatMap((log) => log.weight == null ? [] : [log.weight]); const maximum = Math.max(...weights, item.currentWeight || 1);
        return <button className="fitness-progress-card" key={item.id} onClick={() => setHistoryExerciseId(item.id)}><header><span>{item.bodyPart}</span><i>{logs.length} 条记录</i></header><h3>{item.name}</h3><strong>{formatLoad(item.currentWeight, item.unit, item.loadMode)}</strong><div className="fitness-mini-trend">{weights.slice(-8).map((weight, index) => <i key={`${weight}-${index}`} style={{ height: `${Math.max(14, (weight / maximum) * 100)}%` }} />)}{weights.length === 0 && <span>记录第一次训练后显示趋势</span>}</div><footer><span>{latest ? `最近 ${shortDate(latest.date)}` : "尚无历史"}</span><b>{delta == null || delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${delta} ${latest?.unit}`}</b></footer></button>;
      })}</div>
      <section className="fitness-card fitness-activity-calendar"><header><div><p className="section-kicker">LAST 28 DAYS</p><h3>所有活动都算运动</h3></div><strong>{activityLogs.filter((log) => { const difference = (utcDate(today).getTime() - utcDate(log.date).getTime()) / 86400000; return difference >= 0 && difference < 28; }).reduce((sum, log) => sum + log.durationMinutes, 0)} 分钟</strong></header><div className="fitness-heat-grid">{Array.from({ length: 28 }, (_, reverseIndex) => { const date = utcDate(today); date.setUTCDate(date.getUTCDate() - (27 - reverseIndex)); const key = dateKey(date); const minutes = activityLogs.filter((log) => log.date === key).reduce((sum, log) => sum + log.durationMinutes, 0); return <span key={key} className={minutes >= 40 ? "high" : minutes > 0 ? "active" : ""} title={`${key} · ${minutes} 分钟`}><i />{reverseIndex % 7 === 6 && <small>{date.getUTCMonth() + 1}/{date.getUTCDate()}</small>}</span>; })}</div></section>
    </div>}

    {tab === "library" && <div className="fitness-library-view">
      <div className="fitness-section-head"><div><p className="section-kicker">EXERCISE LIBRARY</p><h2>我会的动作</h2><span>技术笔记留在动作里；每次做了多少，留在训练记录里。</span></div><button className="primary-button" onClick={() => setExerciseEditor("new")}>＋ 添加动作</button></div>
      <div className="fitness-library-tools"><label><span>⌕</span><input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="搜索动作或技术要点" /></label><div><button className={bodyPart === "全部" ? "active" : ""} onClick={() => setBodyPart("全部")}>全部</button>{BODY_PARTS.map((part) => <button className={bodyPart === part ? "active" : ""} key={part} onClick={() => setBodyPart(part)}>{part}</button>)}</div></div>
      <div className="fitness-library-grid">{visibleExercises.map((item) => <article key={item.id}><header><span>{item.bodyPart}</span><i>{item.mastered ? "已掌握" : "学习中"}</i></header><button onClick={() => setExerciseEditor(item)}><h3>{item.name}</h3><strong>{formatLoad(item.currentWeight, item.unit, item.loadMode)}</strong><p>{item.notes || "还没有动作笔记。"}</p></button><footer><span>{item.defaultSets} 组 · {item.defaultReps} 次</span><button onClick={() => setHistoryExerciseId(item.id)}>历史 {exerciseLogs.filter((log) => log.exerciseId === item.id).length}</button></footer></article>)}</div>
    </div>}

    {planEditor && <PlanModal value={planEditor} exercises={exercises} isNew={!trainingPlans.some((item) => item.id === planEditor.id)} onClose={() => setPlanEditor(null)} onSave={(plan) => { const withoutConflict = trainingPlans.filter((item) => item.id === plan.id || item.weekday !== plan.weekday); onChange({ trainingPlans: withoutConflict.some((item) => item.id === plan.id) ? withoutConflict.map((item) => item.id === plan.id ? plan : item) : [...withoutConflict, plan] }); setPlanEditor(null); }} onDelete={() => { onChange({ trainingPlans: trainingPlans.filter((item) => item.id !== planEditor.id) }); setPlanEditor(null); }} />}
    {sessionPlan && <SessionModal plan={sessionPlan} today={today} exercises={exercises} onClose={() => setSessionPlan(null)} onSave={(logs, activity) => { const nextExercises = exercises.map((item) => { const latest = logs.find((log) => log.exerciseId === item.id); return latest?.weight != null ? { ...item, currentWeight: latest.weight, unit: latest.unit, loadMode: latest.loadMode } : item; }); onChange({ exerciseLogs: [...exerciseLogs, ...logs], activityLogs: [...activityLogs, activity], exercises: nextExercises }); setSessionPlan(null); }} />}
    {activityEditor && <ActivityModal value={activityEditor} today={today} onClose={() => setActivityEditor(null)} onSave={(log) => { onChange({ activityLogs: activityEditor === "new" ? [...activityLogs, log] : activityLogs.map((item) => item.id === log.id ? log : item) }); setActivityEditor(null); }} onDelete={activityEditor === "new" ? undefined : () => { onChange({ activityLogs: activityLogs.filter((item) => item.id !== activityEditor.id) }); setActivityEditor(null); }} />}
    {exerciseEditor && <ExerciseModal value={exerciseEditor} onClose={() => setExerciseEditor(null)} onSave={(item) => { onChange({ exercises: exerciseEditor === "new" ? [...exercises, item] : exercises.map((current) => current.id === item.id ? item : current) }); setExerciseEditor(null); }} onDelete={exerciseEditor === "new" ? undefined : () => { onChange({ exercises: exercises.filter((item) => item.id !== exerciseEditor.id), exerciseLogs: exerciseLogs.filter((log) => log.exerciseId !== exerciseEditor.id), trainingPlans: trainingPlans.map((plan) => ({ ...plan, exerciseIds: plan.exerciseIds.filter((exerciseId) => exerciseId !== exerciseEditor.id) })) }); setExerciseEditor(null); }} />}
    {historyExerciseId && <HistoryModal exercise={exerciseById.get(historyExerciseId)} logs={exerciseLogs.filter((log) => log.exerciseId === historyExerciseId).slice().sort((a, b) => b.date.localeCompare(a.date))} onClose={() => setHistoryExerciseId(null)} onEdit={(log) => { setHistoryExerciseId(null); setLogEditor(log); }} onDelete={(logId) => onChange({ exerciseLogs: exerciseLogs.filter((log) => log.id !== logId) })} />}
    {logEditor && <ExerciseLogModal value={logEditor} today={today} exercises={exercises} onClose={() => setLogEditor(null)} onSave={saveExerciseLog} onDelete={logEditor === "new" ? undefined : () => { onChange({ exerciseLogs: exerciseLogs.filter((item) => item.id !== logEditor.id) }); setLogEditor(null); }} />}
  </div>;
}

function Modal({ title, subtitle, children, onClose }: { title: string; subtitle: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop fitness-modal-backdrop"><section className="modal fitness-modal"><header><div><p className="section-kicker">{subtitle}</p><h2>{title}</h2></div><button onClick={onClose} aria-label="关闭">×</button></header>{children}</section></div>;
}

function PlanModal({ value, exercises, isNew, onClose, onSave, onDelete }: { value: TrainingPlan; exercises: ExerciseDefinition[]; isNew: boolean; onClose: () => void; onSave: (value: TrainingPlan) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(value);
  const update = <K extends keyof TrainingPlan>(key: K, next: TrainingPlan[K]) => setDraft((current) => ({ ...current, [key]: next }));
  const splitTotal = draft.warmupMinutes + draft.strengthMinutes + draft.cardioMinutes;
  const invalidSplit = draft.kind === "strength" && splitTotal > 40;
  return <Modal title={isNew ? "安排训练" : "编辑训练计划"} subtitle="WEEKLY PLAN" onClose={onClose}><div className="form-grid"><label className="wide"><span>名称</span><input value={draft.title} onChange={(event) => update("title", event.target.value)} /></label><label><span>星期</span><select value={draft.weekday} onChange={(event) => update("weekday", Number(event.target.value))}>{MONDAY_ORDER.map((day) => <option value={day} key={day}>{DAY_NAMES[day]}</option>)}</select></label><label><span>类型</span><select value={draft.kind} onChange={(event) => update("kind", event.target.value as TrainingPlan["kind"])}><option value="strength">力量</option><option value="cardio">有氧</option><option value="recovery">恢复 / 休息</option><option value="flex">自由活动</option></select></label><label><span>预计分钟</span><input type="number" min="0" max="40" value={draft.durationMinutes} onChange={(event) => update("durationMinutes", Math.min(40, Math.max(0, Number(event.target.value))))} /></label><label><span>单次上限</span><input type="number" min="1" max="40" value={draft.maxMinutes} onChange={(event) => update("maxMinutes", Math.min(40, Math.max(1, Number(event.target.value))))} /></label>{draft.kind === "strength" && <><label><span>热身</span><input type="number" min="0" max="40" value={draft.warmupMinutes} onChange={(event) => update("warmupMinutes", Number(event.target.value))} /></label><label><span>力量</span><input type="number" min="0" max="40" value={draft.strengthMinutes} onChange={(event) => update("strengthMinutes", Number(event.target.value))} /></label><label><span>有氧</span><input type="number" min="0" max="40" value={draft.cardioMinutes} onChange={(event) => update("cardioMinutes", Number(event.target.value))} /></label></>}<label className="wide"><span>备注</span><textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} /></label><label className="wide fitness-exercise-picker"><span>训练动作</span><div>{exercises.map((item) => <button type="button" className={draft.exerciseIds.includes(item.id) ? "selected" : ""} key={item.id} onClick={() => update("exerciseIds", draft.exerciseIds.includes(item.id) ? draft.exerciseIds.filter((id) => id !== item.id) : [...draft.exerciseIds, item.id])}>{item.name}</button>)}</div></label></div><p className="fitness-form-hint">{invalidSplit ? `当前时间结构合计 ${splitTotal} 分钟，请压到 40 分钟以内。` : "正式训练的总时长会限制在 40 分钟；休息日不需要“补打卡”。"}</p><div className="modal-actions">{!isNew && <button className="danger-button" onClick={onDelete}>删除安排</button>}<button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!draft.title.trim() || invalidSplit} onClick={() => onSave({ ...draft, durationMinutes: Math.min(40, draft.durationMinutes), maxMinutes: Math.min(40, draft.maxMinutes) })}>保存</button></div></Modal>;
}

type SessionRow = { exerciseId: string; loadMode: LoadMode; weight: string; unit: WeightUnit; sets: string; reps: string; rir: string; notes: string };
function SessionModal({ plan, today, exercises, onClose, onSave }: { plan: TrainingPlan; today: string; exercises: ExerciseDefinition[]; onClose: () => void; onSave: (logs: ExerciseLog[], activity: ActivityLog) => void }) {
  const [date, setDate] = useState(today); const [duration, setDuration] = useState(String(plan.durationMinutes)); const [notes, setNotes] = useState("");
  const planExercises = plan.exerciseIds.flatMap((exerciseId) => { const item = exercises.find((exercise) => exercise.id === exerciseId); return item ? [item] : []; });
  const [rows, setRows] = useState<SessionRow[]>(plan.kind === "strength" ? planExercises.filter((item) => item.bodyPart !== "有氧与活动").map((item) => ({ exerciseId: item.id, loadMode: item.loadMode, weight: item.currentWeight == null ? "" : String(item.currentWeight), unit: item.unit, sets: String(item.defaultSets), reps: Array.from({ length: item.defaultSets }, () => item.defaultReps.match(/\d+/)?.[0] || "10").join(", "), rir: "", notes: "" })) : []);
  const updateRow = (index: number, patch: Partial<SessionRow>) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const submit = () => {
    const logs = rows.map((row) => ({ id: id("elog"), exerciseId: row.exerciseId, date, loadMode: row.loadMode, weight: row.loadMode === "bodyweight" || row.weight === "" ? null : Number(row.weight), unit: row.unit, sets: Math.max(1, Number(row.sets) || 1), reps: row.reps.split(/[,，\s]+/).map(Number).filter(Number.isFinite), rir: row.rir === "" ? null : Number(row.rir), notes: row.notes, planId: plan.id }));
    onSave(logs, { id: id("activity"), type: plan.title, date, durationMinutes: Math.min(40, Math.max(1, Number(duration) || plan.durationMinutes)), distance: null, distanceUnit: "km", intensity: "中等", notes, planId: plan.id });
  };
  return <Modal title={plan.title} subtitle="LOG SESSION" onClose={onClose}><div className="fitness-session-meta"><label><span>日期</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label><span>总时长（最多 40）</span><input type="number" min="1" max="40" value={duration} onChange={(event) => setDuration(event.target.value)} /></label></div>{rows.length > 0 ? <div className="fitness-session-rows">{rows.map((row, index) => { const item = exercises.find((exercise) => exercise.id === row.exerciseId); return <section key={row.exerciseId}><header><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item?.name}</strong><small>{item?.notes.split("；")[0]}</small></div></header><div><label><span>方式</span><select value={row.loadMode} onChange={(event) => updateRow(index, { loadMode: event.target.value as LoadMode })}>{Object.entries(LOAD_LABEL).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>重量</span><input type="number" step="0.01" disabled={row.loadMode === "bodyweight"} value={row.weight} onChange={(event) => updateRow(index, { weight: event.target.value })} /></label><label><span>单位</span><select value={row.unit} onChange={(event) => updateRow(index, { unit: event.target.value as WeightUnit })}><option>lb</option><option>kg</option></select></label><label><span>组数</span><input type="number" min="1" max="10" value={row.sets} onChange={(event) => updateRow(index, { sets: event.target.value })} /></label><label className="wide"><span>每组次数（逗号分隔）</span><input value={row.reps} onChange={(event) => updateRow(index, { reps: event.target.value })} placeholder="10, 10, 9" /></label><label><span>RIR 可选</span><input type="number" min="0" max="10" value={row.rir} onChange={(event) => updateRow(index, { rir: event.target.value })} /></label><label className="wide"><span>备注</span><input value={row.notes} onChange={(event) => updateRow(index, { notes: event.target.value })} /></label></div></section>; })}</div> : <p className="fitness-form-hint">这次只记录活动时长；不会创建没有意义的力量组数。</p>}<label className="fitness-session-note"><span>整次训练备注</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="身体状态、路线或其他感受（可选）" /></label><div className="modal-actions"><button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" onClick={submit}>完成并保存</button></div></Modal>;
}

function ActivityModal({ value, today, onClose, onSave, onDelete }: { value: ActivityLog | "new"; today: string; onClose: () => void; onSave: (value: ActivityLog) => void; onDelete?: () => void }) {
  const [draft, setDraft] = useState<ActivityLog>(value === "new" ? { id: id("activity"), type: "散步", date: today, durationMinutes: 30, distance: null, distanceUnit: "km", intensity: "轻松", notes: "", planId: null } : value);
  const update = <K extends keyof ActivityLog>(key: K, next: ActivityLog[K]) => setDraft((current) => ({ ...current, [key]: next }));
  const isCustom = !ACTIVITY_TYPES.slice(0, -1).includes(draft.type);
  return <Modal title={value === "new" ? "记录一次运动" : "编辑运动记录"} subtitle="ACTIVITY" onClose={onClose}><div className="form-grid"><label><span>活动</span><select value={isCustom ? "其他" : draft.type} onChange={(event) => update("type", event.target.value)}>{ACTIVITY_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><label><span>日期</span><input type="date" value={draft.date} onChange={(event) => update("date", event.target.value)} /></label>{isCustom && <label className="wide"><span>自定义活动名称</span><input value={draft.type === "其他" ? "" : draft.type} onChange={(event) => update("type", event.target.value || "其他")} placeholder="例如 羽毛球、划船机" /></label>}<label><span>分钟</span><input type="number" min="1" value={draft.durationMinutes} onChange={(event) => update("durationMinutes", Math.max(1, Number(event.target.value)))} /></label><label><span>主观强度</span><select value={draft.intensity} onChange={(event) => update("intensity", event.target.value as ActivityLog["intensity"])}><option value="">未记录</option><option>轻松</option><option>中等</option><option>较高</option></select></label><label><span>距离（可选）</span><input type="number" step="0.01" value={draft.distance ?? ""} onChange={(event) => update("distance", event.target.value === "" ? null : Number(event.target.value))} /></label><label><span>距离单位</span><select value={draft.distanceUnit} onChange={(event) => update("distanceUnit", event.target.value as ActivityLog["distanceUnit"])}><option>km</option><option>mi</option></select></label><label className="wide"><span>备注</span><textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} /></label></div><div className="modal-actions">{onDelete && <button className="danger-button" onClick={onDelete}>删除</button>}<button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!draft.type.trim() || draft.type === "其他"} onClick={() => onSave(draft)}>保存</button></div></Modal>;
}

function ExerciseModal({ value, onClose, onSave, onDelete }: { value: ExerciseDefinition | "new"; onClose: () => void; onSave: (value: ExerciseDefinition) => void; onDelete?: () => void }) {
  const [draft, setDraft] = useState<ExerciseDefinition>(value === "new" ? { id: id("exercise"), name: "", bodyPart: "胸部", mastered: false, notes: "", currentWeight: null, unit: "lb", loadMode: "weight", defaultSets: 3, defaultReps: "8–12" } : value);
  const update = <K extends keyof ExerciseDefinition>(key: K, next: ExerciseDefinition[K]) => setDraft((current) => ({ ...current, [key]: next }));
  return <Modal title={value === "new" ? "添加动作" : draft.name} subtitle="EXERCISE" onClose={onClose}><div className="form-grid"><label className="wide"><span>动作名称</span><input value={draft.name} onChange={(event) => update("name", event.target.value)} /></label><label><span>身体部位</span><select value={draft.bodyPart} onChange={(event) => update("bodyPart", event.target.value as ExerciseDefinition["bodyPart"])}>{BODY_PARTS.map((part) => <option key={part}>{part}</option>)}</select></label><label><span>掌握状态</span><select value={draft.mastered ? "yes" : "no"} onChange={(event) => update("mastered", event.target.value === "yes")}><option value="yes">已掌握</option><option value="no">学习中</option></select></label><label><span>负重方式</span><select value={draft.loadMode} onChange={(event) => update("loadMode", event.target.value as LoadMode)}>{Object.entries(LOAD_LABEL).map(([mode, label]) => <option value={mode} key={mode}>{label}</option>)}</select></label><label><span>当前工作重量</span><input type="number" step="0.01" disabled={draft.loadMode === "bodyweight"} value={draft.currentWeight ?? ""} onChange={(event) => update("currentWeight", event.target.value === "" ? null : Number(event.target.value))} /></label><label><span>单位</span><select value={draft.unit} onChange={(event) => update("unit", event.target.value as WeightUnit)}><option>lb</option><option>kg</option></select></label><label><span>建议组数</span><input type="number" min="1" max="10" value={draft.defaultSets} onChange={(event) => update("defaultSets", Number(event.target.value))} /></label><label><span>建议次数</span><input value={draft.defaultReps} onChange={(event) => update("defaultReps", event.target.value)} /></label><label className="wide"><span>动作笔记与技术要点</span><textarea className="fitness-technique-editor" value={draft.notes} onChange={(event) => update("notes", event.target.value)} /></label></div><div className="modal-actions">{onDelete && <button className="danger-button" onClick={onDelete}>删除动作与历史</button>}<button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!draft.name.trim()} onClick={() => onSave(draft)}>保存</button></div></Modal>;
}

function ExerciseLogModal({ value, today, exercises, onClose, onSave, onDelete }: { value: ExerciseLog | "new"; today: string; exercises: ExerciseDefinition[]; onClose: () => void; onSave: (value: ExerciseLog) => void; onDelete?: () => void }) {
  const first = exercises[0];
  const [draft, setDraft] = useState<ExerciseLog>(value === "new" ? { id: id("elog"), exerciseId: first?.id || "", date: today, loadMode: first?.loadMode || "weight", weight: first?.currentWeight ?? null, unit: first?.unit || "lb", sets: first?.defaultSets || 3, reps: [10, 10, 10], rir: null, notes: "", planId: null } : value);
  const [repsText, setRepsText] = useState(draft.reps.join(", "));
  const update = <K extends keyof ExerciseLog>(key: K, next: ExerciseLog[K]) => setDraft((current) => ({ ...current, [key]: next }));
  return <Modal title={value === "new" ? "补记力量训练" : "纠正训练记录"} subtitle="STRENGTH LOG" onClose={onClose}><div className="form-grid"><label className="wide"><span>动作</span><select value={draft.exerciseId} onChange={(event) => { const item = exercises.find((exercise) => exercise.id === event.target.value); setDraft((current) => ({ ...current, exerciseId: event.target.value, loadMode: item?.loadMode || current.loadMode, weight: item?.currentWeight ?? current.weight, unit: item?.unit || current.unit })); }}>{exercises.map((item) => <option value={item.id} key={item.id}>{item.bodyPart} · {item.name}</option>)}</select></label><label><span>日期</span><input type="date" value={draft.date} onChange={(event) => update("date", event.target.value)} /></label><label><span>负重方式</span><select value={draft.loadMode} onChange={(event) => update("loadMode", event.target.value as LoadMode)}>{Object.entries(LOAD_LABEL).map(([mode, label]) => <option value={mode} key={mode}>{label}</option>)}</select></label><label><span>重量</span><input type="number" step="0.01" disabled={draft.loadMode === "bodyweight"} value={draft.weight ?? ""} onChange={(event) => update("weight", event.target.value === "" ? null : Number(event.target.value))} /></label><label><span>单位</span><select value={draft.unit} onChange={(event) => update("unit", event.target.value as WeightUnit)}><option>lb</option><option>kg</option></select></label><label><span>组数</span><input type="number" min="1" value={draft.sets} onChange={(event) => update("sets", Number(event.target.value))} /></label><label className="wide"><span>每组次数</span><input value={repsText} onChange={(event) => setRepsText(event.target.value)} placeholder="10, 10, 9" /></label><label><span>RIR 可选</span><input type="number" min="0" max="10" value={draft.rir ?? ""} onChange={(event) => update("rir", event.target.value === "" ? null : Number(event.target.value))} /></label><label className="wide"><span>备注</span><textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} /></label></div><div className="modal-actions">{onDelete && <button className="danger-button" onClick={onDelete}>删除记录</button>}<button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!draft.exerciseId} onClick={() => onSave({ ...draft, reps: repsText.split(/[,，\s]+/).map(Number).filter(Number.isFinite) })}>保存</button></div></Modal>;
}

function HistoryModal({ exercise, logs, onClose, onEdit, onDelete }: { exercise?: ExerciseDefinition; logs: ExerciseLog[]; onClose: () => void; onEdit: (log: ExerciseLog) => void; onDelete: (id: string) => void }) {
  return <Modal title={exercise?.name || "动作历史"} subtitle="WEIGHT HISTORY" onClose={onClose}><div className="fitness-history-summary"><span>当前工作重量</span><strong>{exercise ? formatLoad(exercise.currentWeight, exercise.unit, exercise.loadMode) : "—"}</strong><small>历史记录不会因更新当前重量而消失</small></div>{logs.length ? <div className="fitness-log-list">{logs.map((log) => <article key={log.id}><time>{log.date}</time><div><strong>{formatLoad(log.weight, log.unit, log.loadMode)}</strong><span>{log.sets} 组 · {log.reps.join(" / ") || "次数未记"}{log.rir != null ? ` · RIR ${log.rir}` : ""}</span>{log.notes && <p>{log.notes}</p>}</div><button onClick={() => onEdit(log)}>编辑</button><button onClick={() => onDelete(log.id)}>删除</button></article>)}</div> : <p className="fitness-empty-copy">还没有历史记录。</p>}<div className="modal-actions"><button className="primary-button" onClick={onClose}>完成</button></div></Modal>;
}
