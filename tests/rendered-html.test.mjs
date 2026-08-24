import assert from "node:assert/strict";
import test from "node:test";
import { rollOverTasks } from "../lib/task-rollover.mjs";

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
  assert.match(html, /四个月毕业作战地图/);
  assert.match(html, /灵感笔记/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("MAP AI sends conversation, selected model, app context, and approval schema", { concurrency: false }, async () => {
  const worker = await loadWorker();
  const currentData = { tasks: [], schedule: [], goals: [], habits: [], workouts: [], applications: [], notes: [], habitDate: "2026-08-23", workoutWeek: "2026-08-17" };
  const expected = { reply: "我会先分析，不修改数据。", action: "answer", summary: "", changes: [], nextData: currentData };
  const originalFetch = globalThis.fetch;
  let outbound;
  globalThis.fetch = async (_url, init) => {
    outbound = JSON.parse(init.body);
    return Response.json({ output_text: JSON.stringify(expected) });
  };
  try {
    const response = await worker.fetch(new Request("http://localhost/api/ai-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-5.4", today: "2026-08-23", currentData, messages: [{ role: "user", content: "分析我的计划" }] }) }), { OPENAI_API_KEY: "test-key" }, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
    assert.equal(outbound.model, "gpt-5.4");
    assert.equal(outbound.store, false);
    assert.deepEqual(outbound.input, [{ role: "user", content: "分析我的计划" }]);
    assert.match(outbound.instructions, /今日指挥台/);
    assert.match(outbound.instructions, /HIGH-FREQUENCY JOB CAPTURE/);
    assert.match(outbound.instructions, /CURRENT MAP DATA/);
    assert.deepEqual(outbound.text.format.schema.required, ["reply", "action", "summary", "changes", "nextData"]);
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
