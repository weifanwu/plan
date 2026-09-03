/* global chrome */

const PROFILE_KEY = "mapAutofillProfile";
const form = document.getElementById("profile-form");
const status = document.getElementById("save-status");
const experienceList = document.getElementById("experience-list");
const experienceTemplate = document.getElementById("experience-template");
const addExperienceButton = document.getElementById("add-experience");

function markDirty() {
  status.textContent = "有尚未保存的修改";
}

function updateExperienceIndexes() {
  const cards = [...experienceList.querySelectorAll(".experience-card")];
  cards.forEach((card, index) => {
    card.querySelector(".experience-index").textContent = String(index + 1).padStart(2, "0");
    card.querySelector(".remove-experience").hidden = cards.length === 1;
  });
}

function syncCurrentRole(card) {
  const current = card.querySelector('[data-field="current"]');
  const endMonth = card.querySelector('[data-field="endMonth"]');
  endMonth.disabled = current.checked;
  endMonth.closest("label").classList.toggle("disabled", current.checked);
}

function renderExperience(experience = {}) {
  const fragment = experienceTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".experience-card");
  for (const field of card.querySelectorAll("[data-field]")) {
    const key = field.dataset.field;
    if (field instanceof HTMLInputElement && field.type === "checkbox") field.checked = Boolean(experience[key]);
    else field.value = typeof experience[key] === "string" ? experience[key] : "";
  }
  card.querySelector('[data-field="current"]').addEventListener("change", () => syncCurrentRole(card));
  card.querySelector(".remove-experience").addEventListener("click", () => {
    card.remove();
    if (!experienceList.children.length) renderExperience();
    updateExperienceIndexes();
    markDirty();
  });
  experienceList.append(fragment);
  syncCurrentRole(card);
  updateExperienceIndexes();
}

function readExperiences() {
  return [...experienceList.querySelectorAll(".experience-card")]
    .map((card) => {
      const experience = {};
      for (const field of card.querySelectorAll("[data-field]")) {
        const key = field.dataset.field;
        experience[key] = field instanceof HTMLInputElement && field.type === "checkbox" ? field.checked : field.value.trim();
      }
      if (experience.current) experience.endMonth = "";
      return experience;
    })
    .filter((experience) => Object.entries(experience).some(([key, value]) => key !== "current" && Boolean(value)));
}

async function loadProfile() {
  const stored = await chrome.storage.local.get(PROFILE_KEY);
  const profile = stored[PROFILE_KEY] && typeof stored[PROFILE_KEY] === "object" ? stored[PROFILE_KEY] : {};
  for (const field of form.elements) {
    if (!field.name || !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) continue;
    field.value = typeof profile[field.name] === "string" ? profile[field.name] : "";
  }
  experienceList.replaceChildren();
  const experiences = Array.isArray(profile.workExperiences) ? profile.workExperiences : [];
  if (experiences.length) experiences.forEach(renderExperience);
  else renderExperience();
  const configured = Object.values(profile).some((value) => typeof value === "string" && value.trim()) || experiences.length > 0;
  status.textContent = configured ? "已载入本地资料" : "先填写你愿意自动使用的项目";
}

form.addEventListener("input", markDirty);
addExperienceButton.addEventListener("click", () => {
  renderExperience();
  markDirty();
  experienceList.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const profile = {};
  for (const [key, value] of new FormData(form).entries()) profile[key] = String(value).trim();
  profile.workExperiences = readExperiences();
  await chrome.storage.local.set({ [PROFILE_KEY]: profile });
  status.textContent = "已保存 · 不会发送给 MAP 或 AI";
});

void loadProfile();
