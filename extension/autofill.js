/* global chrome */

(() => {
  const PROFILE_KEY = "mapAutofillProfile";
  const ORIGINS_KEY = "mapAutofillOrigins";

  if (globalThis.__MAP_AUTOFILL__) {
    void globalThis.__MAP_AUTOFILL__.startIfEnabled();
    return;
  }

  const blockedField = /password|passcode|security\s*(answer|question)|social\s*security|\bssn\b|social\s*insurance|\bsin\b|tax\s*(id|number)|date\s*of\s*birth|\bdob\b|birth\s*date|gender|sex(ual)?|race|ethnic|disabilit|veteran|salary|compensation|signature|credit\s*card|bank|routing/i;
  const ignoredTypes = new Set(["button", "submit", "reset", "hidden", "password", "file", "checkbox", "radio", "image"]);
  const autocompleteMap = {
    "given-name": "firstName",
    "family-name": "lastName",
    name: "fullName",
    email: "email",
    tel: "phone",
    "tel-national": "phone",
    "street-address": "address",
    "address-line1": "address",
    "address-level2": "city",
    "address-level1": "province",
    "postal-code": "postalCode",
    country: "country",
    "country-name": "country",
  };
  const fieldRules = [
    ["preferredName", /preferred\s*(first\s*)?name|chosen\s*name|昵称|常用名/i],
    ["firstName", /first\s*name|given\s*name|legal\s*first|名\b/i],
    ["lastName", /last\s*name|family\s*name|surname|legal\s*last|姓\b/i],
    ["fullName", /full\s*name|legal\s*name|candidate\s*name|your\s*name|姓名/i],
    ["email", /e-?mail|email\s*address|电子邮件|邮箱/i],
    ["phone", /phone|mobile|telephone|cell|联系电话|手机号|电话/i],
    ["address", /street\s*address|address\s*line\s*1|home\s*address|mailing\s*address|街道|地址/i],
    ["city", /\bcity\b|town|municipality|城市/i],
    ["province", /province|state(?!ment)|region|省份|省\/州/i],
    ["postalCode", /postal|zip\s*code|postcode|邮编/i],
    ["country", /country|国家/i],
    ["linkedin", /linkedin/i],
    ["github", /github/i],
    ["portfolio", /portfolio|personal\s*(website|site)|website\s*url|个人网站/i],
    ["school", /school|university|college|institution|学校|大学/i],
    ["program", /major|field\s*of\s*study|program|discipline|专业/i],
    ["degree", /degree|qualification|学历|学位/i],
    ["graduation", /graduation|graduate\s*(date|year)|completion\s*(date|year)|毕业/i],
    ["workAuthorization", /authorized.*work|work.*authori[sz]|legally.*work|eligible.*work|工作许可/i],
    ["sponsorship", /sponsor|sponsorship|visa\s*support|需要.*担保|签证担保/i],
  ];

  let observer = null;
  let mutationTimer = null;
  let toastTimer = null;

  function normalize(value) {
    return String(value || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-.:*()[\]]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function labelText(field) {
    const parts = [];
    if (field.labels) parts.push(...[...field.labels].map((label) => label.textContent || ""));
    const labelledBy = field.getAttribute("aria-labelledby");
    if (labelledBy) parts.push(...labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || ""));
    parts.push(field.getAttribute("aria-label") || "", field.getAttribute("name") || "", field.id || "", field.getAttribute("placeholder") || "");
    return normalize(parts.join(" "));
  }

  function profileKeyFor(field, descriptor) {
    const autocomplete = normalize(field.getAttribute("autocomplete")).split(" ").find((token) => autocompleteMap[token]);
    if (autocomplete) return autocompleteMap[autocomplete];
    if (blockedField.test(descriptor)) return "";
    return fieldRules.find(([, pattern]) => pattern.test(descriptor))?.[0] || "";
  }

  function setNativeValue(field, value) {
    const prototype = field instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(field, value);
    else field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function fillSelect(field, desired) {
    const target = normalize(desired);
    const options = [...field.options];
    const match = options.find((option) => normalize(option.value) === target || normalize(option.textContent) === target)
      || options.find((option) => normalize(option.value).includes(target) || normalize(option.textContent).startsWith(target));
    if (!match || match.disabled) return false;
    setNativeValue(field, match.value);
    return true;
  }

  function showToast(message) {
    let host = document.getElementById("map-autofill-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "map-autofill-toast-host";
      host.style.position = "fixed";
      host.style.zIndex = "2147483647";
      host.style.right = "20px";
      host.style.bottom = "20px";
      document.documentElement.append(host);
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>div{max-width:320px;padding:12px 14px;border:1px solid #171914;border-left:6px solid #d5f43f;border-radius:10px;background:#fffefb;color:#171914;font:600 13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 12px 38px rgba(0,0,0,.18)}</style><div role="status"></div>`;
    }
    host.shadowRoot.querySelector("div").textContent = message;
    host.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { host.hidden = true; }, 3600);
  }

  async function fillPage({ announceEmpty = false } = {}) {
    const stored = await chrome.storage.local.get(PROFILE_KEY);
    const profile = stored[PROFILE_KEY] && typeof stored[PROFILE_KEY] === "object" ? stored[PROFILE_KEY] : {};
    const fields = [...document.querySelectorAll("input, select, textarea")];
    let filled = 0;
    const matchedKeys = [];

    for (const field of fields) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) continue;
      if (field.disabled || field.readOnly || field.closest("[hidden], [aria-hidden='true']")) continue;
      if (field instanceof HTMLInputElement && ignoredTypes.has((field.type || "text").toLowerCase())) continue;
      if (String(field.value || "").trim()) continue;
      const descriptor = labelText(field);
      if (!descriptor || blockedField.test(descriptor)) continue;
      const key = profileKeyFor(field, descriptor);
      const desired = key ? String(profile[key] || "").trim() : "";
      if (!desired) continue;
      const success = field instanceof HTMLSelectElement ? fillSelect(field, desired) : (setNativeValue(field, desired), true);
      if (success) {
        filled += 1;
        matchedKeys.push(key);
      }
    }

    if (filled > 0) showToast(`MAP 已填写 ${filled} 个空白字段，请检查后再继续。`);
    else if (announceEmpty) showToast("没有找到可安全自动填写的空白字段。");
    return { ok: true, filled, matchedKeys: [...new Set(matchedKeys)], scanned: fields.length };
  }

  function startObserver() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(() => {
      window.clearTimeout(mutationTimer);
      mutationTimer = window.setTimeout(() => { void fillPage(); }, 350);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    observer?.disconnect();
    observer = null;
    window.clearTimeout(mutationTimer);
  }

  async function startIfEnabled() {
    const stored = await chrome.storage.local.get(ORIGINS_KEY);
    const origins = Array.isArray(stored[ORIGINS_KEY]) ? stored[ORIGINS_KEY] : [];
    if (!origins.includes(window.location.origin)) {
      stopObserver();
      return false;
    }
    await fillPage();
    startObserver();
    return true;
  }

  globalThis.__MAP_AUTOFILL__ = { fillPage, startIfEnabled, stopObserver };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "MAP_AUTOFILL_RUN") {
      fillPage({ announceEmpty: true }).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "自动填写失败。" }));
      return true;
    }
    if (message?.type === "MAP_AUTOFILL_STOP") {
      stopObserver();
      sendResponse({ ok: true });
    }
    return false;
  });

  void startIfEnabled();
})();
