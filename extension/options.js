/* global chrome */

const PROFILE_KEY = "mapAutofillProfile";
const form = document.getElementById("profile-form");
const status = document.getElementById("save-status");

async function loadProfile() {
  const stored = await chrome.storage.local.get(PROFILE_KEY);
  const profile = stored[PROFILE_KEY] && typeof stored[PROFILE_KEY] === "object" ? stored[PROFILE_KEY] : {};
  for (const field of form.elements) {
    if (!field.name || !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) continue;
    field.value = typeof profile[field.name] === "string" ? profile[field.name] : "";
  }
  status.textContent = Object.values(profile).some(Boolean) ? "已载入本地资料" : "先填写你愿意自动使用的项目";
}

form.addEventListener("input", () => { status.textContent = "有尚未保存的修改"; });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const profile = {};
  for (const [key, value] of new FormData(form).entries()) profile[key] = String(value).trim();
  await chrome.storage.local.set({ [PROFILE_KEY]: profile });
  status.textContent = "已保存 · 不会发送给 MAP 或 AI";
});

void loadProfile();
