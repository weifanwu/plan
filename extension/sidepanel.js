/* global chrome */

import { extractLinkedInJob } from "./linkedin-extractor.js";

const elements = Object.fromEntries(["status", "job-form", "role", "company", "location", "stage", "date", "link", "description", "refresh"].map((id) => [id, document.getElementById(id)]));
let extractedJob = null;
let activeTabId = null;
let lastJobKey = "";
let autoReadTimer = null;
let isReading = false;
let readAgain = false;

function jobKeyFromUrl(value) {
  try {
    const url = new URL(value || "");
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname) || !url.pathname.startsWith("/jobs/")) return "";
    return url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1]
      || url.searchParams.get("currentJobId")?.match(/^\d+$/)?.[0]
      || `${url.pathname}${url.search}`;
  } catch {
    return "";
  }
}

function scheduleAutoRead(delay = 650) {
  window.clearTimeout(autoReadTimer);
  autoReadTimer = window.setTimeout(() => { void extractCurrentJob(true); }, delay);
}

function torontoToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function setStatus(message, tone = "") {
  elements.status.textContent = message;
  elements.status.className = `status ${tone}`.trim();
}

function fillForm(job) {
  elements.role.value = job.role || "";
  elements.company.value = job.company || "";
  elements.location.value = job.location || "";
  elements.stage.value = "已投";
  elements.date.value = torontoToday();
  elements.link.value = job.link || "";
  elements.description.value = job.description || "";
  elements["job-form"].hidden = false;
}

async function extractCurrentJob(automatic = false) {
  if (isReading) {
    readAgain = true;
    return;
  }
  isReading = true;
  elements.refresh.disabled = true;
  setStatus(automatic ? "检测到新岗位，正在自动读取…" : "正在读取当前 LinkedIn 岗位…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("没有找到当前网页，请关闭侧边栏后重试。");
    activeTabId = tab.id;
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractLinkedInJob });
    if (result?.unsupported) throw new Error("请先打开一个 LinkedIn 岗位详情页，再点击 MAP 扩展。");
    if (!result) throw new Error("没有读取到当前岗位，请刷新 LinkedIn 页面后重试。");
    extractedJob = result;
    lastJobKey = result.externalJobId || jobKeyFromUrl(result.link || tab.url);
    fillForm(result);
    setStatus(result.warnings?.length ? `已读取，但请检查：${result.warnings.join("；")}。` : "已自动读取当前岗位。切换岗位后这里会同步更新。", result.warnings?.length ? "" : "success");
  } catch (error) {
    extractedJob = null;
    elements["job-form"].hidden = true;
    setStatus(error instanceof Error ? error.message : "暂时无法读取当前岗位。", "error");
  } finally {
    isReading = false;
    elements.refresh.disabled = false;
    if (readAgain) {
      readAgain = false;
      scheduleAutoRead(300);
    }
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId !== activeTabId || !changeInfo.url) return;
  const nextJobKey = jobKeyFromUrl(changeInfo.url || tab.url);
  if (nextJobKey && nextJobKey !== lastJobKey) scheduleAutoRead();
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  activeTabId = tabId;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const nextJobKey = jobKeyFromUrl(tab?.url);
  if (nextJobKey && nextJobKey !== lastJobKey) scheduleAutoRead(250);
});

elements.refresh.addEventListener("click", () => { void extractCurrentJob(false); });
elements["job-form"].addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  const action = submit instanceof HTMLButtonElement && submit.value === "save" ? "save" : "preview";
  if (submit instanceof HTMLButtonElement) submit.disabled = true;
  const capture = {
    captureId: crypto.randomUUID(),
    action,
    application: {
      company: elements.company.value.trim(),
      role: elements.role.value.trim(),
      location: elements.location.value.trim(),
      stage: elements.stage.value,
      date: elements.date.value,
      link: elements.link.value.trim(),
      description: elements.description.value.trim(),
      notes: "",
      externalJobId: extractedJob?.externalJobId || "",
      capturedAt: extractedJob?.capturedAt || new Date().toISOString(),
    },
  };
  try {
    const response = await chrome.runtime.sendMessage({ type: "QUEUE_MAP_JOB_CAPTURE", capture });
    if (!response?.ok) throw new Error(response?.error || "无法打开 MAP。");
    setStatus(action === "save" ? "已交给 MAP 直接保存；如果岗位已存在，不会重复添加。" : "MAP 已打开。请在预览中确认后再保存。", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "无法把岗位送到 MAP。", "error");
  } finally {
    if (submit instanceof HTMLButtonElement) submit.disabled = false;
  }
});

void extractCurrentJob(false);
