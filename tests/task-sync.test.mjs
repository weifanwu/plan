import assert from "node:assert/strict";
import test from "node:test";
import { mergeSyncPayload, toSyncPayload } from "../lib/sync-state.mjs";
import { rollOverTasks } from "../lib/task-rollover.mjs";
import { shiftTaskToDate } from "../lib/task-reschedule.mjs";

const original = { id: "appointment", title: "预约", date: "2026-09-05", endDate: null, carriedFrom: null, status: "todo", completedAt: null, details: "原始备注" };
const payload = (...tasks) => toSyncPayload({ tasks });

test("reopening a stale device cannot replace Tuesday's manual move with Sunday's rollover", () => {
  const base = payload(original);
  const reopened = payload(...rollOverTasks(base.tasks, "2026-09-06"));
  reopened.tasks[0].details = "旧设备上的新备注";
  const scheduled = payload(shiftTaskToDate(original, "2026-09-08"));
  for (const [local, remote] of [[reopened, scheduled], [scheduled, reopened]]) {
    const result = mergeSyncPayload(base, local, remote);
    assert.equal(result.conflicts, 0);
    assert.equal(result.data.tasks[0].date, "2026-09-08");
    assert.equal(result.data.tasks[0].carriedFrom, null);
    assert.equal(result.data.tasks[0].details, "旧设备上的新备注");
    // Save, close, reopen on Monday and synchronize again.
    const disk = JSON.parse(JSON.stringify(result.data));
    disk.tasks = rollOverTasks(disk.tasks, "2026-09-07");
    const next = mergeSyncPayload(result.data, disk, result.data);
    assert.equal(next.data.tasks[0].date, "2026-09-08");
  }
});

test("rollover alone cannot resurrect a deleted or completed task", () => {
  const base = payload(original);
  const rolled = payload(...rollOverTasks(base.tasks, "2026-09-06"));
  for (const [local, remote] of [[rolled, payload()], [payload(), rolled]]) {
    assert.deepEqual(mergeSyncPayload(base, local, remote).data.tasks, []);
  }
  const done = payload({ ...original, status: "done", completedAt: "2026-09-05" });
  for (const [local, remote] of [[rolled, done], [done, rolled]]) {
    assert.deepEqual(mergeSyncPayload(base, local, remote).data.tasks, done.tasks);
  }
});

test("automatic rollover remains available and converges across devices on different days", () => {
  const base = payload(original);
  const sunday = payload(...rollOverTasks(base.tasks, "2026-09-06"));
  const monday = payload(...rollOverTasks(base.tasks, "2026-09-07"));
  assert.equal(mergeSyncPayload(base, sunday, base).data.tasks[0].date, "2026-09-06");
  assert.equal(mergeSyncPayload(base, base, sunday).data.tasks[0].date, "2026-09-06");
  for (const [local, remote] of [[sunday, monday], [monday, sunday]]) {
    const result = mergeSyncPayload(base, local, remote);
    assert.equal(result.conflicts, 0);
    assert.equal(result.data.tasks[0].date, "2026-09-07");
    assert.equal(result.data.tasks[0].carriedFrom, original.date);
  }
});

test("rescheduling an already-carried task preserves its new complete date range", () => {
  const overdue = { ...original, date: "2026-09-03", endDate: "2026-09-05", carriedFrom: "2026-09-01" };
  const base = payload(overdue);
  const rolled = payload(...rollOverTasks(base.tasks, "2026-09-06"));
  const moved = payload(shiftTaskToDate(overdue, "2026-09-08"));
  for (const [local, remote] of [[rolled, moved], [moved, rolled]]) {
    const result = mergeSyncPayload(base, local, remote);
    assert.equal(result.conflicts, 0);
    assert.deepEqual(result.data.tasks, moved.tasks);
  }
});

test("manual rescheduling still wins if that date has itself become overdue", () => {
  const base = payload(original);
  const oldAutomatic = payload(...rollOverTasks(base.tasks, "2026-09-10"));
  const manual = payload(shiftTaskToDate(original, "2026-09-08"));
  const result = mergeSyncPayload(base, oldAutomatic, manual);
  assert.equal(result.data.tasks[0].date, "2026-09-08");
  const today = rollOverTasks(result.data.tasks, "2026-09-10");
  assert.equal(today[0].date, "2026-09-10");
  assert.equal(today[0].carriedFrom, "2026-09-08");
});
