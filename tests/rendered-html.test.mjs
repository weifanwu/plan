import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyAIOperations } from "../lib/ai-operations.mjs";
import { rollOverTasks } from "../lib/task-rollover.mjs";
import { isTaskActiveOn, isTaskVisibleToday } from "../lib/task-visibility.mjs";

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

test("server-renders MAP", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>MAP/);
  assert.match(html, /Life Operating System/);
  assert.match(html, /灵感笔记/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
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

test("workflow controls expose ranges, friendly weekdays, status filters, and undo", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /结束日期（可选）/);
  assert.match(source, /每周重复日期/);
  assert.match(source, /任务状态筛选/);
  assert.match(source, /undoLastAction/);
  assert.match(source, /upcomingTask/);
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
    assert.deepEqual(await response.json(), { text: "明天提醒我投三份简历" });
    assert.equal(outboundUrl, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(outboundBody.get("model"), "gpt-transcribe");
    assert.equal(outboundBody.get("file").name, "map-voice.webm");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MAP AI sends conversation, selected model, app context, and approval schema", { concurrency: false }, async () => {
  const worker = await loadWorker();
  const currentData = { tasks: [], schedule: [], goals: [], habits: [], workouts: [], applications: [], notes: [], habitDate: "2026-08-23", workoutWeek: "2026-08-17" };
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
    assert.match(outbound.instructions, /HIGH-FREQUENCY JOB CAPTURE/);
    assert.match(outbound.instructions, /CURRENT MAP CONTEXT/);
    assert.deepEqual(outbound.text.format.schema.required, ["reply", "action", "summary", "operations"]);
    assert.equal(outbound.reasoning.effort, "medium");
    assert.equal(outbound.text.verbosity, "low");
    assert.equal(outbound.max_output_tokens, 5000);
    assert.equal(outbound.prompt_cache_key, "map-ai-v4-gpt-5.6-sol-full");
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
