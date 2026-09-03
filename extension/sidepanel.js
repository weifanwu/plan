/* global chrome */

import { extractLinkedInJob } from "./linkedin-extractor.js";

const elements = Object.fromEntries(["status", "job-form", "role", "company", "location", "stage", "date", "link", "description", "refresh"].map((id) => [id, document.getElementById(id)]));
const autofillElements = Object.fromEntries(["job-mode", "autofill-mode", "mode-job", "mode-autofill", "autofill-status", "fill-page", "auto-site", "site-label", "edit-profile", "profile-summary"].map((id) => [id, document.getElementById(id)]));
const PROFILE_KEY = "mapAutofillProfile";
const AUTOFILL_ORIGINS_KEY = "mapAutofillOrigins";
let extractedJob = null;
let activeTabId = null;
let activeTabUrl = "";
let activeMode = "job";
let lastJobKey = "";
let autoReadTimer = null;
let isReading = false;
let readAgain = false;

function pageOrigin(value) {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

function originPattern(value) {
  const origin = pageOrigin(value);
  return origin ? `${origin}/*` : "";
}

function setMode(mode) {
  activeMode = mode;
  const jobMode = mode === "job";
  autofillElements["job-mode"].hidden = !jobMode;
  autofillElements["autofill-mode"].hidden = jobMode;
  autofillElements["mode-job"].classList.toggle("active", jobMode);
  autofillElements["mode-autofill"].classList.toggle("active", !jobMode);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    activeTabId = tab.id;
    activeTabUrl = tab.url || "";
  }
  return tab || null;
}

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

function setAutofillStatus(message, tone = "") {
  autofillElements["autofill-status"].textContent = message;
  autofillElements["autofill-status"].className = `status ${tone}`.trim();
}

function autofillErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/cannot access contents|must request permission|cannot access a chrome/i.test(message)) return "MAP 还没有当前网站的访问权限。更新扩展后请在 chrome://extensions 重新加载，再回到申请页重试。";
  return message || "自动填写失败。";
}

async function refreshAutofillState(tab = null) {
  const currentTab = tab || await getActiveTab();
  const origin = pageOrigin(currentTab?.url);
  activeTabUrl = currentTab?.url || activeTabUrl;
  autofillElements["site-label"].textContent = origin ? new URL(origin).hostname : "当前页面不支持自动填写";
  autofillElements["fill-page"].disabled = !origin;
  autofillElements["auto-site"].disabled = !origin;
  const stored = await chrome.storage.local.get([PROFILE_KEY, AUTOFILL_ORIGINS_KEY]);
  const profile = stored[PROFILE_KEY] && typeof stored[PROFILE_KEY] === "object" ? stored[PROFILE_KEY] : {};
  const origins = Array.isArray(stored[AUTOFILL_ORIGINS_KEY]) ? stored[AUTOFILL_ORIGINS_KEY] : [];
  const configuredFields = Object.values(profile).filter((value) => typeof value === "string" && value.trim()).length;
  const experienceCount = Array.isArray(profile.workExperiences) ? profile.workExperiences.length : 0;
  const configured = configuredFields + experienceCount;
  autofillElements["profile-summary"].textContent = configured ? `已设置 ${configuredFields} 项资料 · ${experienceCount} 段工作经历` : "尚未设置资料 · 点击开始填写";
  autofillElements["auto-site"].checked = Boolean(origin && origins.includes(origin));
  if (!origin) setAutofillStatus("Chrome 内部页面不能自动填写，请打开招聘申请表。", "error");
  else if (!configured) setAutofillStatus("先填写一次个人资料，再回到申请页面使用。", "");
  else setAutofillStatus(`已准备好 ${configuredFields} 项资料和 ${experienceCount} 段经历。只填写空白字段。`, "success");
}

async function ensureSitePermission(tab) {
  const pattern = originPattern(tab?.url);
  if (!pattern) throw new Error("当前页面不支持自动填写。");
  if (await chrome.permissions.contains({ origins: [pattern] })) return pattern;
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) throw new Error("没有获得这个网站的填写权限。");
  return pattern;
}

async function injectAndFill(tab, announceResult = true) {
  if (!tab?.id) throw new Error("没有找到当前申请页面。");
  await ensureSitePermission(tab);
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["autofill.js"] });
  const result = await chrome.tabs.sendMessage(tab.id, { type: "MAP_AUTOFILL_RUN" });
  if (!result?.ok) throw new Error(result?.error || "自动填写失败。");
  if (announceResult) setAutofillStatus(result.filled ? `已填写 ${result.filled} 个字段。请检查后继续。` : result.addedExperience ? "正在展开下一段工作经历并继续填写…" : "没有找到可安全填写的空白字段。", result.filled ? "success" : "");
  return result;
}

async function fillCurrentPage() {
  const button = autofillElements["fill-page"];
  button.disabled = true;
  setAutofillStatus("正在识别当前页面的空白字段…");
  try {
    const tab = await getActiveTab();
    await injectAndFill(tab);
  } catch (error) {
    setAutofillStatus(autofillErrorMessage(error), "error");
  } finally {
    button.disabled = false;
  }
}

async function toggleSiteAutofill() {
  const toggle = autofillElements["auto-site"];
  const tab = await getActiveTab();
  const origin = pageOrigin(tab?.url);
  if (!origin) {
    toggle.checked = false;
    setAutofillStatus("当前页面不支持持续填写。", "error");
    return;
  }
  const stored = await chrome.storage.local.get(AUTOFILL_ORIGINS_KEY);
  const origins = Array.isArray(stored[AUTOFILL_ORIGINS_KEY]) ? stored[AUTOFILL_ORIGINS_KEY] : [];
  try {
    if (toggle.checked) {
      await ensureSitePermission(tab);
      await chrome.storage.local.set({ [AUTOFILL_ORIGINS_KEY]: [...new Set([...origins, origin])] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["autofill.js"] });
      await chrome.tabs.sendMessage(tab.id, { type: "MAP_AUTOFILL_RUN" });
      setAutofillStatus(`已为 ${new URL(origin).hostname} 开启持续填写。页面进入下一步时会继续。`, "success");
    } else {
      await chrome.storage.local.set({ [AUTOFILL_ORIGINS_KEY]: origins.filter((item) => item !== origin) });
      await chrome.tabs.sendMessage(tab.id, { type: "MAP_AUTOFILL_STOP" }).catch(() => undefined);
      const pattern = originPattern(tab.url);
      if (pattern && !/(^|\.)linkedin\.com$/i.test(new URL(origin).hostname)) await chrome.permissions.remove({ origins: [pattern] }).catch(() => false);
      setAutofillStatus(`已关闭 ${new URL(origin).hostname} 的持续填写。`);
    }
  } catch (error) {
    toggle.checked = !toggle.checked;
    setAutofillStatus(error instanceof Error ? error.message : "无法更新网站权限。", "error");
  }
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
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("没有找到当前网页，请关闭侧边栏后重试。");
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
  if (tabId !== activeTabId) return;
  activeTabUrl = changeInfo.url || tab.url || activeTabUrl;
  if (changeInfo.url) void refreshAutofillState(tab);
  const nextJobKey = jobKeyFromUrl(activeTabUrl);
  if (activeMode === "job" && nextJobKey && nextJobKey !== lastJobKey) scheduleAutoRead();
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  activeTabId = tabId;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  activeTabUrl = tab?.url || "";
  const nextJobKey = jobKeyFromUrl(tab?.url);
  setMode(nextJobKey ? "job" : "autofill");
  void refreshAutofillState(tab);
  if (nextJobKey && nextJobKey !== lastJobKey) scheduleAutoRead(250);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes[PROFILE_KEY] || changes[AUTOFILL_ORIGINS_KEY])) void refreshAutofillState();
});

autofillElements["mode-job"].addEventListener("click", () => { setMode("job"); void extractCurrentJob(false); });
autofillElements["mode-autofill"].addEventListener("click", () => { setMode("autofill"); void refreshAutofillState(); });
autofillElements["fill-page"].addEventListener("click", () => { void fillCurrentPage(); });
autofillElements["auto-site"].addEventListener("change", () => { void toggleSiteAutofill(); });
autofillElements["edit-profile"].addEventListener("click", () => { void chrome.runtime.openOptionsPage(); });

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
    setStatus(action === "save" ? "已在后台交给 MAP 保存；你可以继续浏览 LinkedIn。重复岗位不会再添加。" : "MAP 已打开。请在预览中确认后再保存。", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "无法把岗位送到 MAP。", "error");
  } finally {
    if (submit instanceof HTMLButtonElement) submit.disabled = false;
  }
});

async function initializePanel() {
  const tab = await getActiveTab();
  const isJob = Boolean(jobKeyFromUrl(tab?.url));
  setMode(isJob ? "job" : "autofill");
  await refreshAutofillState(tab);
  if (isJob) await extractCurrentJob(false);
}

void initializePanel();
