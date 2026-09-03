import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("MAP extension limits LinkedIn access to jobs pages and uses a narrow MAP bridge", async () => {
  const manifest = JSON.parse(await readFile(new URL("extension/manifest.json", root), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes("activeTab"));
  assert.ok(manifest.permissions.includes("scripting"));
  assert.equal(manifest.permissions.includes("tabs"), false);
  assert.deepEqual(manifest.host_permissions.filter((permission) => permission.includes("linkedin.com")), [
    "https://*.linkedin.com/jobs/*",
  ]);
  assert.deepEqual(manifest.content_scripts[0].matches, [
    "https://map-life-weifan.deep-robin-3429.chatgpt.site/*",
    "http://localhost:3000/*",
  ]);
  assert.equal(manifest.content_scripts[0].matches.some((permission) => permission.includes("linkedin.com")), false);
});

test("job capture is preview-first and never writes MAP data directly", async () => {
  const worker = await readFile(new URL("extension/service-worker.js", root), "utf8");
  const bridge = await readFile(new URL("extension/map-bridge.js", root), "utf8");
  const sidepanel = await readFile(new URL("extension/sidepanel.js", root), "utf8");
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.doesNotMatch(worker, /fetch\s*\(/);
  assert.match(sidepanel, /QUEUE_MAP_JOB_CAPTURE/);
  assert.match(bridge, /MAP_JOB_CAPTURE/);
  assert.match(page, /检查 LinkedIn 岗位/);
  assert.match(page, /检查内容后再保存，不会自动写入看板/);
});

test("job capture offers validated one-click save without bypassing MAP", async () => {
  const worker = await readFile(new URL("extension/service-worker.js", root), "utf8");
  const bridge = await readFile(new URL("extension/map-bridge.js", root), "utf8");
  const sidepanel = await readFile(new URL("extension/sidepanel.js", root), "utf8");
  const markup = await readFile(new URL("extension/sidepanel.html", root), "utf8");
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(markup, /value="save">直接保存/);
  assert.match(markup, /value="preview">先预览/);
  assert.match(sidepanel, /action === "save"/);
  assert.match(bridge, /action: capture\.action/);
  assert.match(worker, /QUEUE_MAP_JOB_CAPTURE/);
  assert.doesNotMatch(worker, /fetch\s*\(/);
  assert.match(page, /没有重复保存/);
  assert.match(page, /已直接保存/);
});

test("LinkedIn extractor has structured-data and DOM fallbacks", async () => {
  const extractor = await readFile(new URL("extension/linkedin-extractor.js", root), "utf8");
  assert.match(extractor, /application\/ld\+json/);
  assert.match(extractor, /JobPosting/);
  assert.match(extractor, /#job-details/);
  assert.match(extractor, /isLinkedInJobsPage/);
  assert.doesNotMatch(extractor, /fetch\s*\(/);
});

test("open side panel follows LinkedIn SPA job URL changes automatically", async () => {
  const sidepanel = await readFile(new URL("extension/sidepanel.js", root), "utf8");
  const markup = await readFile(new URL("extension/sidepanel.html", root), "utf8");
  assert.match(sidepanel, /chrome\.tabs\.onUpdated\.addListener/);
  assert.match(sidepanel, /currentJobId/);
  assert.match(sidepanel, /scheduleAutoRead/);
  assert.match(markup, /随岗位自动更新/);
  assert.match(markup, /手动重试/);
});
