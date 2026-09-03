/* global chrome */

import { extractLinkedInJob } from "./linkedin-extractor.js";

const elements = Object.fromEntries(["status", "job-form", "role", "company", "location", "stage", "date", "link", "description", "refresh"].map((id) => [id, document.getElementById(id)]));
let extractedJob = null;

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

async function extractCurrentJob() {
  elements.refresh.disabled = true;
  setStatus("正在读取当前 LinkedIn 岗位…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/([a-z]+\.)?linkedin\.com\/jobs\//i.test(tab.url || "")) throw new Error("请先打开一个 LinkedIn 岗位详情页，再点击 MAP 扩展。");
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractLinkedInJob });
    if (!result) throw new Error("没有读取到当前岗位，请刷新 LinkedIn 页面后重试。");
    extractedJob = result;
    fillForm(result);
    setStatus(result.warnings?.length ? `已读取，但请检查：${result.warnings.join("；")}。` : "已读取当前岗位。检查后送到 MAP 预览。", result.warnings?.length ? "" : "success");
  } catch (error) {
    extractedJob = null;
    elements["job-form"].hidden = true;
    setStatus(error instanceof Error ? error.message : "暂时无法读取当前岗位。", "error");
  } finally {
    elements.refresh.disabled = false;
  }
}

elements.refresh.addEventListener("click", () => { void extractCurrentJob(); });
elements["job-form"].addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  if (submit instanceof HTMLButtonElement) submit.disabled = true;
  const capture = {
    captureId: crypto.randomUUID(),
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
    setStatus("MAP 已打开。请在 MAP 的预览中确认后再保存。", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "无法把岗位送到 MAP。", "error");
  } finally {
    if (submit instanceof HTMLButtonElement) submit.disabled = false;
  }
});

void extractCurrentJob();
