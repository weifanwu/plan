/* global chrome */

const MAP_ORIGIN = "https://map-life-weifan.deep-robin-3429.chatgpt.site";
const MAP_MATCHES = [`${MAP_ORIGIN}/*`, "http://localhost:3000/*"];
const PENDING_CAPTURE_KEY = "pendingMapJobCapture";

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
    await chrome.tabs.update(existing.id, { active: true });
    await deliverToExistingMapTab(existing.id, capture).catch(() => undefined);
    return { opened: false };
  }
  await chrome.tabs.create({ url: `${MAP_ORIGIN}/` });
  return { opened: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "QUEUE_MAP_JOB_CAPTURE" || !message.capture) return false;
  openMapWithCapture(message.capture)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "无法打开 MAP。" }));
  return true;
});
