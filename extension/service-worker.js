/* global chrome */

const MAP_ORIGIN = "https://map-life-weifan.deep-robin-3429.chatgpt.site";
const MAP_MATCHES = [`${MAP_ORIGIN}/*`, "http://localhost:3000/*"];
const PENDING_CAPTURE_KEY = "pendingMapJobCapture";
const AUTOFILL_ORIGINS_KEY = "mapAutofillOrigins";

async function configureExtension() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });
}

configureExtension().catch(() => undefined);
chrome.runtime.onInstalled.addListener(() => { configureExtension().catch(() => undefined); });
chrome.runtime.onStartup.addListener(() => { configureExtension().catch(() => undefined); });

async function deliverToExistingMapTab(tabId, capture) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "DELIVER_MAP_JOB_CAPTURE", capture });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["map-bridge.js"] });
    await chrome.tabs.sendMessage(tabId, { type: "DELIVER_MAP_JOB_CAPTURE", capture });
  }
}

async function openMapWithCapture(capture) {
  await chrome.storage.session.set({ [PENDING_CAPTURE_KEY]: capture });
  const mapTabs = await chrome.tabs.query({ url: MAP_MATCHES });
  const existing = mapTabs.find((tab) => typeof tab.id === "number");
  if (existing?.id) {
    if (capture.action !== "save") await chrome.tabs.update(existing.id, { active: true });
    await deliverToExistingMapTab(existing.id, capture).catch(() => undefined);
    return { opened: false, background: capture.action === "save" };
  }
  await chrome.tabs.create({ url: `${MAP_ORIGIN}/`, active: capture.action !== "save" });
  return { opened: true, background: capture.action === "save" };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "QUEUE_MAP_JOB_CAPTURE" || !message.capture) return false;
  openMapWithCapture(message.capture)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "无法打开 MAP。" }));
  return true;
});

function pageOrigin(value) {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

async function injectAutofillForEnabledSite(tabId, url) {
  const origin = pageOrigin(url);
  if (!origin) return;
  const stored = await chrome.storage.local.get(AUTOFILL_ORIGINS_KEY);
  const enabledOrigins = Array.isArray(stored[AUTOFILL_ORIGINS_KEY]) ? stored[AUTOFILL_ORIGINS_KEY] : [];
  if (!enabledOrigins.includes(origin)) return;
  await chrome.scripting.executeScript({ target: { tabId }, files: ["autofill.js"] });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  void injectAutofillForEnabledSite(tabId, tab.url).catch(() => undefined);
});
