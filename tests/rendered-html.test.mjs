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
  assert.match(source, /className="mobile-nav"/);
  for (const label of ["今天", "日程", "草稿", "任务", "更多"]) assert.match(source, new RegExp(`<strong>${label}<\\/strong>`));
  for (const label of ["长期目标", "求职记录", "私人速记", "健康运动"]) assert.match(source, new RegExp(`<strong>${label}<\\/strong>`));
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /100dvh/);
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
  assert.match(source, /拖动普通任务到日期格即可改期/);
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
  assert.match(source, /完成后自动从日历隐藏/);
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
  const base = { phase: { title: "A" }, habitDate: "2026-08-24", workoutWeek: "2026-08-24", tasks: [{ id: "t1", title: "base" }], routines: [], schedule: [], goals: [], habits: [], workouts: [], applications: [], notes: [], references: [] };
  const local = structuredClone(base);
  local.tasks[0].title = "local edit";
  const remote = structuredClone(base);
  remote.notes.push({ id: "n1", content: "remote note" });
  const merged = mergeSyncPayload(base, local, remote);
  assert.equal(merged.conflicts, 0);
  assert.equal(merged.data.tasks[0].title, "local edit");
  assert.equal(merged.data.notes[0].content, "remote note");
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
  const data = { phase: { title: "毕业" }, habitDate: "2026-08-24", workoutWeek: "2026-08-24", tasks: [], routines: [], schedule: [], goals: [], habits: [], workouts: [], applications: [], notes: [] };
  const created = await worker.fetch(new Request("http://localhost/api/sync", { method: "PUT", headers, body: JSON.stringify({ baseRevision: 0, data }) }), env, ctx);
  assert.equal(created.status, 200);
  assert.equal((await created.json()).revision, 1);
  const loaded = await worker.fetch(new Request("http://localhost/api/sync", { headers }), env, ctx);
  const loadedData = (await loaded.json()).data;
  assert.equal(loadedData.phase.title, "毕业");
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
  assert.match(styles, /\.idea-workbench/);
  assert.match(styles, /nav button\.drag-over/);
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

test("voice input is exposed in the MAP AI composer", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /开始语音输入/);
  assert.match(source, /\/api\/transcribe/);
  assert.match(source, /MAP 不保存录音/);
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
