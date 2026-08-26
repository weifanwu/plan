import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyAIOperations } from "../lib/ai-operations.mjs";
import { isRoutineDueOn, nextRoutineOccurrence, routineTodayEntry } from "../lib/routine-schedule.mjs";
import { isCompletedTaskArchived } from "../lib/task-retention.mjs";
import { shiftTaskToDate } from "../lib/task-reschedule.mjs";
import { rollOverTasks } from "../lib/task-rollover.mjs";
import { isTaskActiveOn, isTaskVisibleToday } from "../lib/task-visibility.mjs";
import { mergeSyncPayload, toSyncPayload } from "../lib/sync-state.mjs";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("api-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

function createMockD1() {
  let row = null;
  return {
    prepare(sql) {
      let values = [];
      return {
        bind(...nextValues) { values = nextValues; return this; },
        async first() { return row ? { ...row } : null; },
        async run() {
          if (sql.startsWith("INSERT INTO map_user_state")) {
            row = { user_id: values[0], payload_json: values[1], revision: 1, updated_at: values[2] };
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("UPDATE map_user_state") && row?.user_id === values[3] && row.revision === values[4]) {
            row = { ...row, payload_json: values[0], revision: values[1], updated_at: values[2] };
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
    },
  };
}

test("server-renders MAP", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>MAP/);
  assert.match(html, /Life Operating System/);
  assert.match(html, /草稿箱/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("mobile shell prioritizes five touch targets and keeps every module reachable", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.match(source, /className="mobile-nav"/);
  assert.match(source, /const DEFAULT_NAV_ORDER: View\[\] = \["semester", "today"/);
  assert.match(source, /mobileQuickViews\.map/);
  assert.match(source, /index === 0 \? "置顶 · " : ""/);
  assert.match(source, /navOrder\.filter\(\(item\) => !mobileQuickViews\.includes\(item\)\)\.map/);
  for (const label of ["今天", "阶段", "草稿", "任务", "更多"]) assert.match(source, new RegExp(label));
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /100dvh/);
  assert.equal(manifest.orientation, "portrait-primary");
  assert.match(source, /lock\?\.\("portrait-primary"\)/);
});

test("mobile calendars render as agendas instead of compressed desktop grids", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /mobile-month-grid/);
  assert.match(source, /mobile-day-agenda/);
  assert.match(source, /mobile-schedule-agenda/);
  assert.match(source, /mobile-week-span-list/);
  assert.match(styles, /\.calendar-scroll \{ display: none; \}\.mobile-month-view \{ display: block;/);
  assert.match(styles, /\.schedule-scroll \{ display: none; \}\.mobile-schedule-agenda \{ display: grid;/);
  assert.match(styles, /\.week-task-grid \{ min-width: 0;/);
});

test("mobile touch alternatives cover ordering, private notes, modals, and AI", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /moveGoalByOffset/);
  assert.match(source, /mobile-reference-back/);
  assert.match(styles, /\.mobile-goal-order \{/);
  assert.match(styles, /\.reference-workbench\.editing \.reference-sidebar \{ display: none; \}/);
  assert.match(styles, /\.ai-panel \{ inset: 0; width: 100%; height: 100dvh;/);
  assert.match(styles, /\.modal-backdrop \{ padding: 0; align-items: end; \}/);
});

test("current phase shows both start and end countdowns before it begins", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /const phaseStartsIn = Math\.max\(0, daysBetween\(today, data\.phase\.startDate\)\)/);
  assert.match(source, /const phaseEndsIn = Math\.max\(0, daysBetween\(today, data\.phase\.endDate\)\)/);
  assert.match(source, /<small>天后开始<\/small>/);
  assert.match(source, /<small>天后结束<\/small>/);
  assert.match(styles, /phase-countdown-display/);
});

test("career board includes application-date filtering and daily counts", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /投递日期/);
  assert.match(source, /全部日期 · \{data\.applications\.length\} 份/);
  assert.match(source, /applicationDateCounts/);
  assert.match(source, /visibleApplications\.filter/);
});

test("multi-day tasks remain visible throughout their active range", () => {
  const task = { date: "2026-08-23", endDate: "2026-09-04", status: "todo", completedAt: null };
  assert.equal(isTaskActiveOn(task, "2026-08-24"), true);
  assert.equal(isTaskVisibleToday(task, "2026-08-24"), true);
  assert.equal(isTaskVisibleToday(task, "2026-09-05"), false);
  assert.equal(isTaskVisibleToday({ ...task, status: "done", completedAt: "2026-08-24" }, "2026-08-24"), true);
});

test("calendar renders ranged work once instead of duplicating it in every day", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /weeklySpanTasks/);
  assert.match(source, /monthlySpanTasks/);
  assert.match(source, /week-span-bar/);
  assert.match(source, /month-span-task/);
  assert.match(source, /!isMultiDayTask\(task\) && task\.date === day\.key/);
  assert.match(source, /!isMultiDayTask\(task\) && task\.date === cell\.key/);
  assert.doesNotMatch(source, /task\.date <= day\.key && \(task\.endDate \|\| task\.date\) >= day\.key/);
});

test("calendar task drag keeps time and shifts the whole date range", () => {
  const task = { id: "range", date: "2026-08-24", endDate: "2026-08-30", time: "09:00", carriedFrom: "2026-08-23" };
  const shifted = shiftTaskToDate(task, "2026-08-27");
  assert.equal(shifted.date, "2026-08-27");
  assert.equal(shifted.endDate, "2026-09-02");
  assert.equal(shifted.time, "09:00");
  assert.equal(shifted.carriedFrom, null);
  assert.equal(task.date, "2026-08-24");
});

test("week and month task cards expose drag, drop, and completion controls", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /beginTaskDrag/);
  assert.match(source, /dropTaskOnDate/);
  assert.match(source, /task-drop-target/);
  assert.match(source, /TaskCalendarCheck/);
  assert.match(source, /拖动普通任务可改期/);
  assert.match(source, /onDoubleClick=\{\(event\) => openQuickTask/);
  assert.match(source, /QuickTaskModal/);
});

test("completed tasks disappear from calendars but remain available in overview views", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /const calendarTasks = useMemo\(\(\) => visibleTasks\.filter\(\(task\) => task\.status === "todo"\)/);
  assert.match(source, /const weeklyTasks = calendarTasks\.filter/);
  assert.match(source, /const monthlySpanTasks = calendarTasks\.filter/);
  assert.equal([...source.matchAll(/const tasks = calendarTasks\.filter/g)].length, 2);
  assert.match(source, /!routine\.completedDates\.includes\(day\.key\)/);
  assert.match(source, /!routine\.completedDates\.includes\(cell\.key\)/);
  assert.match(source, /const todayDisplayTasks = useMemo\(\(\) => visibleTasks\.filter/);
  assert.match(source, /const statusFilteredTasks = useMemo\(\(\) => visibleTasks\.filter/);
  assert.match(source, /完成后从日历隐藏/);
});

test("completed tasks archive from the interface after 60 days", () => {
  const task = { status: "done", completedAt: "2026-06-25", date: "2026-06-20" };
  assert.equal(isCompletedTaskArchived(task, "2026-08-23"), false);
  assert.equal(isCompletedTaskArchived(task, "2026-08-24"), true);
  assert.equal(isCompletedTaskArchived({ ...task, status: "todo" }, "2027-01-01"), false);
});

test("workflow controls expose ranges, friendly weekdays, status filters, and undo", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /结束日期（跨日任务）/);
  assert.match(source, /TaskTimeField/);
  assert.match(source, /time: allDay \? null : time \|\| null/);
  assert.match(source, /全天任务不会绑定具体时刻/);
  assert.match(source, /每周重复日期/);
  assert.match(source, /任务状态筛选/);
  assert.match(source, /undoLastAction/);
  assert.match(source, /upcomingTask/);
});

test("draft inbox keeps unscheduled work compact and promotes it into dated tasks", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /type NoteCategory = "待办"/);
  assert.match(source, /draft-list/);
  assert.match(source, /安排成任务/);
  assert.match(source, /promoteNoteToTask/);
  assert.match(source, /sourceDraft/);
  assert.match(styles, /\.draft-row/);
  assert.doesNotMatch(source, /className="note-grid"/);
});

test("draft inbox reuses online voice transcription without auto-saving", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /toggleVoiceInput\("draft"\)/);
  assert.match(source, /高质量转写后追加进编辑框，不自动保存/);
  assert.match(source, /setNoteDraft\(\(current\)/);
  assert.match(source, /语音需要联网，打字仍可离线保存/);
  assert.match(styles, /\.draft-voice-button/);
});

test("sync includes only explicitly authorized references and merges independent offline edits", () => {
  const base = { phase: { title: "A" }, uiPreferences: { navigationOrder: ["semester", "today"], semesterWeekOrder: ["schedule", "tasks"] }, habitDate: "2026-08-24", workoutWeek: "2026-08-24", tasks: [{ id: "t1", title: "base" }], routines: [], schedule: [], goals: [], habits: [], workouts: [], applications: [], notes: [], references: [] };
  const local = structuredClone(base);
  local.tasks[0].title = "local edit";
  local.uiPreferences.navigationOrder = ["today", "semester"];
  const remote = structuredClone(base);
  remote.notes.push({ id: "n1", content: "remote note" });
  const merged = mergeSyncPayload(base, local, remote);
  assert.equal(merged.conflicts, 0);
  assert.equal(merged.data.tasks[0].title, "local edit");
  assert.equal(merged.data.notes[0].content, "remote note");
  assert.deepEqual(merged.data.uiPreferences.navigationOrder, ["today", "semester"]);
  const localOnly = { id: "secret", title: "SIN", content: "local only", pinned: false, aiExcluded: true, createdAt: "2026-08-24T00:00:00Z", updatedAt: "2026-08-24T00:00:00Z" };
  const authorized = { id: "portal", title: "学校网址", content: "https://example.com", pinned: false, aiExcluded: false, createdAt: "2026-08-24T00:00:00Z", updatedAt: "2026-08-24T00:00:00Z" };
  const payload = toSyncPayload({ ...base, references: [localOnly, authorized] });
  assert.deepEqual(payload.references, [authorized]);
});

test("Sites D1 sync API uses authenticated ownership and revision checks", async () => {
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const hosting = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../drizzle/0000_tiny_zarda.sql", import.meta.url), "utf8");
  assert.equal(hosting.d1, "DB");
  assert.match(worker, /oai-authenticated-user-id/);
  assert.match(worker, /url\.pathname === "\/api\/sync"/);
  assert.match(worker, /WHERE user_id = \? AND revision = \?/);
  assert.match(worker, /reference\.aiExcluded === false/);
  assert.match(worker, /buggy client from uploading device-only notes/);
  assert.match(migration, /CREATE TABLE `map_user_state`/);
});

test("D1 sync API creates user state and rejects a stale revision", async () => {
  const worker = await loadWorker();
  const DB = createMockD1();
  const env = { DB, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const headers = { "oai-authenticated-user-id": "user-1", "content-type": "application/json" };
  const data = { phase: { title: "毕业" }, uiPreferences: { navigationOrder: ["semester", "today"], semesterWeekOrder: ["schedule", "tasks"] }, habitDate: "2026-08-24", workoutWeek: "2026-08-24", tasks: [], routines: [], schedule: [], goals: [], habits: [], workouts: [], applications: [], notes: [] };
  const created = await worker.fetch(new Request("http://localhost/api/sync", { method: "PUT", headers, body: JSON.stringify({ baseRevision: 0, data }) }), env, ctx);
  assert.equal(created.status, 200);
  assert.equal((await created.json()).revision, 1);
  const loaded = await worker.fetch(new Request("http://localhost/api/sync", { headers }), env, ctx);
  const loadedData = (await loaded.json()).data;
  assert.equal(loadedData.phase.title, "毕业");
  assert.deepEqual(loadedData.uiPreferences, data.uiPreferences);
  assert.deepEqual(loadedData.references, []);
  const stale = await worker.fetch(new Request("http://localhost/api/sync", { method: "PUT", headers, body: JSON.stringify({ baseRevision: 0, data }) }), env, ctx);
  assert.equal(stale.status, 409);

  const privateReference = { id: "private", title: "SIN", content: "local", pinned: false, aiExcluded: true, createdAt: "2026-08-24T00:00:00Z", updatedAt: "2026-08-24T00:00:00Z" };
  const privateReferenceEnv = { ...env, DB: createMockD1() };
  const rejected = await worker.fetch(new Request("http://localhost/api/sync", { method: "PUT", headers: { ...headers, "oai-authenticated-user-id": "user-2" }, body: JSON.stringify({ baseRevision: 0, data: { ...data, references: [privateReference] } }) }), privateReferenceEnv, ctx);
  assert.equal(rejected.status, 400);
  const cloudReference = { ...privateReference, id: "cloud", aiExcluded: false };
  const accepted = await worker.fetch(new Request("http://localhost/api/sync", { method: "PUT", headers: { ...headers, "oai-authenticated-user-id": "user-2" }, body: JSON.stringify({ baseRevision: 0, data: { ...data, references: [cloudReference] } }) }), privateReferenceEnv, ctx);
  assert.equal(accepted.status, 200);
});

test("private references use a notes-style list and large autosaving editor", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const appDataType = source.slice(source.indexOf("type AppData ="), source.indexOf("const DAY_ORDER"));
  assert.match(source, /reference-note-list/);
  assert.match(source, /reference-document-editor/);
  assert.match(source, /自动保存/);
  assert.match(source, /新建第一条速记/);
  assert.match(source, /referenceQuery/);
  assert.match(source, /extractReferenceLinks/);
  assert.match(source, /让 MAP AI 整理粘贴内容/);
  assert.match(source, /仅本机 · 不同步/);
  assert.match(source, /AI 可读 · 云端同步/);
  assert.match(source, /不会上传 Cloudflare，也不会进入 MAP AI 上下文/);
  assert.match(source, /aiExcluded: reference\.aiExcluded !== false/);
  assert.doesNotMatch(source, /保存成资料卡/);
  assert.doesNotMatch(source, /className="reference-grid"/);
  assert.match(source, /references: data\.references\.filter/);
  assert.match(source, /currentData: aiReadableData/);
  assert.match(appDataType, /references: ReferenceNote\[\]/);
  assert.match(worker, /key !== "references"/);
  assert.match(worker, /HIGH-FREQUENCY PRIVATE REFERENCE CAPTURE/);
  assert.match(worker, /Do not refuse, redact, omit/);
  assert.match(worker, /Do not repeat sensitive values in the conversational reply/);
  assert.match(worker, /record\?\.aiExcluded === false/);
  assert.match(worker, /New AI-organized notes return to local-only mode/);
  assert.doesNotMatch(source, /sk-proj-/i);
});

test("drafts split compact backlog from long-form idea notes and navigation order persists", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /待安排的小事/);
  assert.match(source, /灵感笔记/);
  assert.match(source, /idea-document-editor/);
  assert.match(source, /交给 MAP AI 整理/);
  assert.match(source, /toggleVoiceInput\("idea"\)/);
  assert.match(source, /NAV_ORDER_STORAGE_KEY/);
  assert.match(source, /moveNavigationItem/);
  assert.match(source, /title="拖动改变导航顺序"/);
  assert.match(source, /openNavigationView\(navOrder\[0\] \?\? "today"\)/);
  assert.doesNotMatch(source, /className="brand" onClick=\{\(\) => setView\("today"\)\}/);
  assert.match(styles, /\.idea-workbench/);
  assert.match(styles, /nav button\.drag-over/);
});

test("ordered navigation and semester layout sync across devices", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const syncSource = await readFile(new URL("../lib/sync-state.mjs", import.meta.url), "utf8");
  const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(source, /type UIPreferences = \{ navigationOrder: View\[\]; semesterWeekOrder: SemesterWeekModule\[\] \}/);
  assert.match(source, /uiPreferences: \{ \.\.\.current\.uiPreferences, navigationOrder: next \}/);
  assert.match(source, /uiPreferences: \{ \.\.\.current\.uiPreferences, semesterWeekOrder: next \}/);
  assert.match(syncSource, /"uiPreferences"/);
  assert.match(workerSource, /"uiPreferences" in payload/);
});

test("today keeps nutrition check-in without duplicating the fitness module", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /DAILY FUEL/);
  assert.match(source, /今日饮食打卡/);
  assert.doesNotMatch(source, /身体也要签到/);
});

test("fixed tasks support daily and every-N-day occurrences with independent completion", () => {
  const daily = { active: true, startDate: "2026-08-24", frequency: "daily", intervalDays: 1, completedDates: [] };
  const everyTwoDays = { active: true, startDate: "2026-08-24", frequency: "interval", intervalDays: 2, completedDates: [] };
  assert.equal(isRoutineDueOn(daily, "2026-08-25"), true);
  assert.equal(isRoutineDueOn(everyTwoDays, "2026-08-25"), false);
  assert.equal(isRoutineDueOn(everyTwoDays, "2026-08-26"), true);
  assert.deepEqual(routineTodayEntry(everyTwoDays, "2026-08-25"), { occurrenceDate: "2026-08-24", completed: false, overdue: true });
  assert.equal(nextRoutineOccurrence(everyTwoDays, "2026-08-25"), "2026-08-26");
});

test("fixed tasks render in today, week, month, and their central manager", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /todayRoutineEntries/);
  assert.match(source, /weeklyRoutineCount/);
  assert.match(source, /visibleRoutineCount/);
  assert.match(source, /routine-manager/);
  assert.match(source, /RoutineModal/);
  assert.match(source, /每隔几天/);
});

test("current phase is editable and drives the long-term time map", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /type ActivePhase/);
  assert.match(source, /编辑当前阶段/);
  assert.match(source, /data\.phase\.startDate/);
  assert.match(source, /buildPhaseCheckpoints/);
  assert.match(source, /阶段已结束 · 点击设置下一阶段/);
});

test("weekly fixed schedule remains visible outside the phase date range", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /data\.schedule\.filter\(\(item\) => item\.days\.includes\(day\)\)\.map/);
  assert.doesNotMatch(source, /weekDays\.find\(\(weekDay\) => weekDay\.dayCode === day\)/);
});

test("semester week modules can be dragged into a persisted local order", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /SEMESTER_LAYOUT_STORAGE_KEY/);
  assert.match(source, /DEFAULT_SEMESTER_WEEK_ORDER/);
  assert.match(source, /moveSemesterModule/);
  assert.match(source, /拖动每周固定课程区块排序/);
  assert.match(source, /拖动本周任务区块排序/);
  assert.match(source, /semesterWeekOrder\.indexOf\("schedule"\)/);
  assert.match(source, /semesterWeekOrder\.indexOf\("tasks"\)/);
  assert.match(styles, /\.semester-week-module\.drag-over/);
  assert.match(styles, /\.semester-module-meta button/);
});

test("tasks can link to goals and be filtered by that execution path", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /goalId\?: string \| null/);
  assert.match(source, /关联长期目标/);
  assert.match(source, /goalTaskStats/);
  assert.match(source, /添加下一步/);
  assert.match(source, /未关联目标/);
});

test("voice input supports both the MAP AI composer and one-tap auto-send", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /开始语音输入/);
  assert.match(source, /toggleVoiceInput\("quick-ai"\)/);
  assert.match(source, /语音问 AI/);
  assert.match(source, /await sendAIMessage\(result\.text, true\)/);
  assert.match(source, /setAiOpen\(true\)/);
  assert.match(source, /\/api\/transcribe/);
  assert.match(source, /MAP 不保存录音/);
  assert.match(styles, /\.ai-voice-launcher\.recording/);
  assert.match(styles, /\.ai-voice-launcher\.transcribing/);
});

test("fitness module separates plans, exercise knowledge, strength history, and activity history", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../app/components/FitnessModule.tsx", import.meta.url), "utf8");
  const defaults = await readFile(new URL("../lib/fitness-data.ts", import.meta.url), "utf8");
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const sync = await readFile(new URL("../lib/sync-state.mjs", import.meta.url), "utf8");
  assert.match(page, /trainingPlans: TrainingPlan\[\]/);
  assert.match(page, /exerciseLogs: ExerciseLog\[\]/);
  assert.match(page, /activityLogs: ActivityLog\[\]/);
  for (const label of ["今日", "本周", "进步", "动作库"]) assert.match(component, new RegExp(`["']${label}["']`));
  assert.match(component, /不用追连续打卡/);
  assert.match(component, /计划给方向/);
  assert.match(component, /记录讲事实/);
  assert.match(component, /今天实际做了这些/);
  assert.match(component, /本周计划与实际/);
  assert.match(component, /查看完整训练/);
  assert.match(component, /TECHNIQUE CHECKLIST/);
  assert.match(component, /String\(index \+ 1\)\.padStart\(2, "0"\)/);
  assert.match(component, /同一天可以保存徒步、散步等多条记录/);
  assert.match(component, /Math\.min\(40/);
  assert.match(component, /辅助重量/);
  assert.match(component, /纠正训练记录/);
  assert.match(component, /所有活动都算运动/);
  for (const plan of ["全身力量 A", "稳态有氧", "全身力量 B", "全身力量 C"]) assert.match(defaults, new RegExp(plan));
  for (const collection of ["trainingPlans", "exercises", "exerciseLogs", "activityLogs"]) {
    assert.match(sync, new RegExp(collection));
    assert.match(worker, new RegExp(collection));
  }
  assert.match(worker, /Never use the legacy workouts collection for new fitness changes/);
  assert.match(worker, /trainingPlans as recurring intentions/);
  assert.match(worker, /create two separate activityLogs/);
  assert.match(worker, /Use the actual duration even when a free activity such as hiking exceeds 40 minutes/);
});

test("meal planner connects flexible weekly choices to recipes, groceries, prep, sync, and AI", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../app/components/MealPlannerModule.tsx", import.meta.url), "utf8");
  const defaults = await readFile(new URL("../lib/meal-data.ts", import.meta.url), "utf8");
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const sync = await readFile(new URL("../lib/sync-state.mjs", import.meta.url), "utf8");
  assert.match(page, /mealThemes: MealTheme\[\]/);
  assert.match(page, /mealPlans: MealPlanEntry\[\]/);
  assert.match(page, /mealRecipes: MealRecipe\[\]/);
  for (const label of ["本周餐盘", "主题库", "采购与备菜", "饮食规则"]) assert.match(component, new RegExp(label));
  assert.match(component, /安排明天早餐/);
  assert.doesNotMatch(component, /安排明天的 Nations 早餐/);
  assert.match(component, /桌面端也可以直接拖动交换日期/);
  assert.match(component, /切换周只切换视图，不会清空以前或未来的安排/);
  assert.doesNotMatch(component, /一键排满早餐/);
  assert.match(component, /采购、现买和备菜分开看/);
  assert.match(component, /预览导入购物清单/);
  assert.match(component, /一个蛋白质＋一个主食＋两种蔬菜/);
  assert.match(component, /MY HEALTH PHILOSOPHY/);
  assert.match(component, /用 MAP AI 编辑/);
  for (const theme of ["Tims 训练启动日", "Nations 酸奶燕麦日", "中式温热早餐日", "鸡肉双蔬饭", "三文鱼完整餐", "豆腐炒蔬菜饭"]) assert.match(defaults, new RegExp(theme));
  for (const collection of ["mealThemes", "mealPlans", "mealRecipes", "nutritionGuides", "purchaseItems"]) {
    assert.match(sync, new RegExp(collection));
    assert.match(worker, new RegExp(collection));
  }
  assert.match(worker, /Ready-made meals and drinks from Tim Hortons/);
  assert.match(worker, /do not assume that Monday must always use the same theme/);
});

test("shopping memory separates urgency and previews meal-derived groceries", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../app/components/ShoppingModule.tsx", import.meta.url), "utf8");
  const procurement = await readFile(new URL("../lib/meal-procurement.ts", import.meta.url), "utf8");
  for (const label of ["下次出门就买", "计划购买", "考虑中", "从本周饮食计划导入", "确认要加入的食材"]) assert.match(component, new RegExp(label));
  assert.match(page, /view === "shopping"/);
  assert.match(component, /buildMealProcurement/);
  assert.match(procurement, /readyMade/);
  assert.match(procurement, /useCounts/);
  assert.match(component, /先预览再加入/);
});

test("AI meal operation changes only the requested dated meal plan", () => {
  const currentData = {
    tasks: [{ id: "task-1", title: "保留原任务" }], mealThemes: [{ id: "theme-1", title: "早餐主题" }], mealPlans: [], mealRecipes: [],
  };
  const meal = { id: "ai-meal", date: "2026-08-25", mealSlot: "早餐", themeId: "theme-1", customTitle: "", notes: "", completed: false };
  const result = applyAIOperations(currentData, [{ collection: "mealPlans", operation: "add", recordId: "ai-meal", recordJson: JSON.stringify(meal) }]);
  assert.deepEqual(result.mealPlans, [meal]);
  assert.deepEqual(result.tasks, currentData.tasks);
  assert.deepEqual(result.mealThemes, currentData.mealThemes);
});

test("voice transcription API forwards audio without persisting it", { concurrency: false }, async () => {
  const worker = await loadWorker();
  const originalFetch = globalThis.fetch;
  let outboundUrl;
  let outboundBody;
  globalThis.fetch = async (url, init) => {
    outboundUrl = String(url);
    outboundBody = init.body;
    return Response.json({ text: "明天提醒我投三份简历" });
  };
  try {
    const form = new FormData();
    form.append("audio", new Blob(["voice-bytes"], { type: "audio/webm" }), "map-voice.webm");
    const response = await worker.fetch(new Request("http://localhost/api/transcribe", { method: "POST", body: form }), { OPENAI_API_KEY: "test-key" }, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: "明天提醒我投三份简历", transcript: "明天提醒我投三份简历" });
    assert.equal(outboundUrl, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(outboundBody.get("model"), "gpt-transcribe");
    assert.equal(outboundBody.get("file").name, "map-voice.webm");
    assert.match(outboundBody.get("prompt"), /code-switching/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MAP AI sends conversation, selected model, app context, and approval schema", { concurrency: false }, async () => {
  const worker = await loadWorker();
  const currentData = { tasks: [], routines: [], schedule: [], goals: [], habits: [], workouts: [], applications: [], notes: [], references: [{ id: "private", title: "private-reference-sentinel", content: "not for ordinary analysis" }], habitDate: "2026-08-23", workoutWeek: "2026-08-17" };
  const expected = { reply: "我会先分析，不修改数据。", action: "answer", summary: "", operations: [] };
  const originalFetch = globalThis.fetch;
  let outbound;
  globalThis.fetch = async (_url, init) => {
    outbound = JSON.parse(init.body);
    return Response.json({ output_text: JSON.stringify(expected) });
  };
  try {
    const response = await worker.fetch(new Request("http://localhost/api/ai-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-5.6-sol", today: "2026-08-23", currentData, messages: [{ role: "user", content: "分析我的计划" }] }) }), { OPENAI_API_KEY: "test-key" }, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
    assert.equal(outbound.model, "gpt-5.6-sol");
    assert.equal(outbound.store, false);
    assert.deepEqual(outbound.input, [{ role: "user", content: "分析我的计划" }]);
    assert.match(outbound.instructions, /今日指挥台/);
    assert.match(outbound.instructions, /草稿箱/);
    assert.match(outbound.instructions, /prefer adding a note with category 待办/);
    assert.match(outbound.instructions, /one ranged task instead of duplicate daily tasks/);
    assert.match(outbound.instructions, /HIGH-FREQUENCY JOB CAPTURE/);
    assert.match(outbound.instructions, /CURRENT MAP CONTEXT/);
    assert.doesNotMatch(outbound.instructions, /private-reference-sentinel/);
    assert.deepEqual(outbound.text.format.schema.required, ["reply", "action", "summary", "operations"]);
    assert.equal(outbound.reasoning.effort, "medium");
    assert.equal(outbound.text.verbosity, "low");
    assert.equal(outbound.max_output_tokens, 5000);
    assert.equal(outbound.prompt_cache_key, "map-ai-v4-gpt-5.6-sol-full");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MAP AI treats an improvised activity as actual history without rewriting the weekly plan", { concurrency: false }, async () => {
  const worker = await loadWorker();
  const currentData = {
    phase: { title: "Fall" }, habitDate: "2026-08-24", workoutWeek: "2026-08-24",
    tasks: [], routines: [], schedule: [], goals: [], habits: [], workouts: [], applications: [], notes: [], references: [],
    trainingPlans: [{ id: "plan-a", title: "全身力量 A", weekday: 1 }], exercises: [], exerciseLogs: [], activityLogs: [],
  };
  const proposed = {
    reply: "实际运动预览已准备好。", action: "proposal", summary: "记录徒步和散步",
    operations: [
      { collection: "activityLogs", operation: "add", recordId: "ai-hike", recordJson: JSON.stringify({ id: "ai-hike", type: "徒步 Hiking", date: "2026-08-24", durationMinutes: 120, distance: null, distanceUnit: "km", intensity: "中等", notes: "", planId: null }) },
      { collection: "trainingPlans", operation: "update", recordId: "plan-a", recordJson: JSON.stringify({ title: "不应被改写" }) },
    ],
  };
  const originalFetch = globalThis.fetch;
  let outbound;
  globalThis.fetch = async (_url, init) => {
    outbound = JSON.parse(init.body);
    return Response.json({ output_text: JSON.stringify(proposed) });
  };
  try {
    const response = await worker.fetch(new Request("http://localhost/api/ai-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentData, today: "2026-08-24", messages: [{ role: "user", content: "记录一下今天 hiking 两个小时" }] }) }), { OPENAI_API_KEY: "test-key" }, { waitUntil() {}, passThroughOnException() {} });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-map-ai-context"), "activityLogs");
    assert.deepEqual(result.operations.map((operation) => operation.collection), ["activityLogs"]);
    assert.deepEqual(outbound.text.format.schema.properties.operations.items.properties.collection.enum, ["activityLogs"]);
    assert.match(outbound.instructions, /全身力量 A/);
    assert.match(outbound.instructions, /create two separate activityLogs/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MAP AI receives private references only when the user explicitly asks for them", { concurrency: false }, async () => {
  const worker = await loadWorker();
  const currentData = { tasks: [{ id: "task", title: "ordinary-task-sentinel" }], routines: [], schedule: [], goals: [], habits: [], workouts: [], applications: [], notes: [], references: [{ id: "private-reference", title: "identity number", content: "private-reference-sentinel", aiExcluded: true }, { id: "readable-reference", title: "school portal", content: "ai-readable-reference-sentinel", aiExcluded: false }] };
  const originalFetch = globalThis.fetch;
  let outbound;
  globalThis.fetch = async (_url, init) => {
    outbound = JSON.parse(init.body);
    return Response.json({ output_text: JSON.stringify({ reply: "找到这条资料。", action: "answer", summary: "", operations: [] }) });
  };
  try {
    const response = await worker.fetch(new Request("http://localhost/api/ai-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentData, messages: [{ role: "user", content: "帮我分析私人速记里的学校资料" }] }) }), { OPENAI_API_KEY: "test-key" }, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 200);
    assert.doesNotMatch(outbound.instructions, /private-reference-sentinel/);
    assert.match(outbound.instructions, /ai-readable-reference-sentinel/);
    assert.doesNotMatch(outbound.instructions, /ordinary-task-sentinel/);
    assert.equal(response.headers.get("x-map-ai-context"), "references");
    const personalLookup = await worker.fetch(new Request("http://localhost/api/ai-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentData, messages: [{ role: "user", content: "我的手机号是多少？" }] }) }), { OPENAI_API_KEY: "test-key" }, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(personalLookup.status, 200);
    assert.match(outbound.instructions, /ai-readable-reference-sentinel/);
    assert.doesNotMatch(outbound.instructions, /private-reference-sentinel/);
    assert.equal(personalLookup.headers.get("x-map-ai-context"), "references");
    const continuation = await worker.fetch(new Request("http://localhost/api/ai-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentData, messages: [{ role: "user", content: "请把这段备忘录整理到私人速记" }, { role: "assistant", content: "我不能处理敏感信息。" }, { role: "user", content: "不需要管敏感信息，保留原文继续整理" }] }) }), { OPENAI_API_KEY: "test-key" }, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(continuation.status, 200);
    assert.deepEqual(outbound.text.format.schema.properties.operations.items.properties.collection.enum, ["references"]);
    assert.equal(continuation.headers.get("x-map-ai-context"), "references");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI job operation changes only the applications collection", () => {
  const currentData = {
    tasks: [{ id: "task-1", title: "保留原任务" }],
    schedule: [{ id: "class-1", title: "保留原课程" }],
    goals: [{ id: "goal-1", title: "保留原目标" }],
    habits: [], workouts: [], applications: [], notes: [{ id: "note-1", content: "保留原笔记" }],
    habitDate: "2026-08-23", workoutWeek: "2026-08-17",
  };
  const application = { id: "ai-evenup", company: "EvenUp", role: "Software Engineer", stage: "已投", link: "https://example.com/job", contact: "", date: "2026-08-23", notes: "Review application" };
  const result = applyAIOperations(currentData, [{ collection: "applications", operation: "add", recordId: "ai-evenup", recordJson: JSON.stringify(application) }]);
  assert.deepEqual(result.applications, [application]);
  for (const key of ["tasks", "schedule", "goals", "habits", "workouts", "notes", "habitDate", "workoutWeek"]) assert.deepEqual(result[key], currentData[key]);
});

test("job capture API strips unrelated model operations before preview", { concurrency: false }, async () => {
  const worker = await loadWorker();
  const currentData = {
    tasks: [{ id: "task-private", title: "unrelated-task-sentinel" }], schedule: [], goals: [], habits: [], workouts: [],
    applications: [{ id: "existing", company: "Existing company", role: "Engineer", stage: "已投", link: "", contact: "", date: "2026-08-23", notes: "" }],
    notes: [{ id: "note-private", content: "unrelated-note-sentinel" }], habitDate: "2026-08-23", workoutWeek: "2026-08-17",
  };
  const proposed = {
    reply: "预览已准备好。", action: "proposal", summary: "添加 EvenUp 岗位",
    operations: [
      { collection: "applications", operation: "add", recordId: "ai-evenup", recordJson: "{}" },
      { collection: "tasks", operation: "update", recordId: "task-1", recordJson: "{\"title\":\"不应修改\"}" },
    ],
  };
  const originalFetch = globalThis.fetch;
  let outbound;
  globalThis.fetch = async (_url, init) => {
    outbound = JSON.parse(init.body);
    return Response.json({ output_text: JSON.stringify(proposed), usage: { input_tokens_details: { cached_tokens: 120 }, output_tokens: 80 } });
  };
  try {
    const response = await worker.fetch(new Request("http://localhost/api/ai-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentData, messages: [{ role: "user", content: "EvenUp Software Engineer https://example.com/job" }, { role: "assistant", content: "我看到了这个岗位。" }, { role: "user", content: "把这段职业信息加入求职看板" }] }) }), { OPENAI_API_KEY: "test-key" }, { waitUntil() {}, passThroughOnException() {} });
    const result = await response.json();
    assert.equal(result.operations.length, 1);
    assert.equal(result.operations[0].collection, "applications");
    assert.equal(outbound.model, "gpt-5.6-luna");
    assert.equal(outbound.max_output_tokens, 1600);
    assert.equal(outbound.prompt_cache_key, "map-ai-v4-gpt-5.6-luna-applications");
    assert.deepEqual(outbound.text.format.schema.properties.operations.items.properties.collection.enum, ["applications"]);
    assert.match(outbound.instructions, /Existing company/);
    assert.doesNotMatch(outbound.instructions, /unrelated-task-sentinel|unrelated-note-sentinel/);
    assert.equal(response.headers.get("x-map-ai-context"), "applications");
    assert.equal(response.headers.get("x-map-ai-cached-tokens"), "120");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unfinished tasks roll forward without duplication", () => {
  const tasks = [
    { id: "old", status: "todo", date: "2026-08-22", endDate: null },
    { id: "done", status: "done", date: "2026-08-22", endDate: null },
    { id: "future", status: "todo", date: "2026-08-24", endDate: null },
  ];
  const result = rollOverTasks(tasks, "2026-08-23");
  assert.equal(result.length, 3);
  assert.deepEqual(result[0], { id: "old", status: "todo", date: "2026-08-23", endDate: null, carriedFrom: "2026-08-22" });
  assert.equal(result[1], tasks[1]);
  assert.equal(result[2], tasks[2]);
});

test("multi-day tasks roll only after their deadline and keep the original missed date", () => {
  const active = { id: "long", status: "todo", date: "2026-08-20", endDate: "2026-08-25" };
  assert.equal(rollOverTasks([active], "2026-08-23")[0], active);

  const firstRollover = rollOverTasks([active], "2026-08-26")[0];
  assert.equal(firstRollover.date, "2026-08-26");
  assert.equal(firstRollover.carriedFrom, "2026-08-25");

  const repeatedRollover = rollOverTasks([firstRollover], "2026-08-27")[0];
  assert.equal(repeatedRollover.date, "2026-08-27");
  assert.equal(repeatedRollover.carriedFrom, "2026-08-25");
});
