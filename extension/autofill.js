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
    "tel-country-code": "phoneCountryCode",
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
    ["phoneCountryCode", /country\s*(phone|calling|dial(ling)?)\s*code|phone\s*country\s*code|calling\s*code|dial(ling)?\s*code|国家.*区号|电话区号/i],
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
  const experienceContextPattern = /work\s*(experience|history)|employment\s*(experience|history)|professional\s*experience|previous\s*(job|employment)|工作经历|就业经历|职业经历/i;
  const experienceFieldRules = [
    ["current", /current(ly)?.*(work|role|job|employ)|still.*(work|employ)|present\s*(role|job)|目前.*(工作|任职)|至今/i],
    ["company", /company(\s*name)?|employer|organization|organisation|business\s*name|公司|雇主|单位/i],
    ["title", /job\s*title|position\s*title|role\s*title|position|occupation|职位|职称/i],
    ["location", /job\s*location|work\s*location|location|city|工作地点|地点/i],
    ["startYear", /(start|from|begin).*(year)|year.*(start|from|begin)|开始.*年/i],
    ["startMonthPart", /(start|from|begin).*(month)|month.*(start|from|begin)|开始.*月/i],
    ["endYear", /(end|to|finish).*(year)|year.*(end|to|finish)|结束.*年/i],
    ["endMonthPart", /(end|to|finish).*(month)|month.*(end|to|finish)|结束.*月/i],
    ["startDate", /start\s*date|date\s*started|employment\s*from|开始日期|入职日期/i],
    ["endDate", /end\s*date|date\s*ended|employment\s*to|结束日期|离职日期/i],
    ["description", /responsibilit|achievement|accomplishment|job\s*dut|role\s*description|work\s*description|summary|职责|工作内容|成就/i],
  ];
  const monthNames = [
    ["01", "1", "jan", "january"], ["02", "2", "feb", "february"], ["03", "3", "mar", "march"],
    ["04", "4", "apr", "april"], ["05", "5", "may"], ["06", "6", "jun", "june"],
    ["07", "7", "jul", "july"], ["08", "8", "aug", "august"], ["09", "9", "sep", "sept", "september"],
    ["10", "oct", "october"], ["11", "nov", "november"], ["12", "dec", "december"],
  ];

  let observer = null;
  let mutationTimer = null;
  let toastTimer = null;
  let experienceAddState = { groupCount: -1, time: 0 };

  function normalize(value) {
    return String(value || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-.:*()[\]]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function labelText(field) {
    const parts = [];
    if (field.labels) parts.push(...[...field.labels].map((label) => label.textContent || ""));
    const labelledBy = field.getAttribute("aria-labelledby");
    if (labelledBy) parts.push(...labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || ""));
    parts.push(
      field.getAttribute("aria-label") || "",
      field.getAttribute("name") || "",
      field.id || "",
      field.getAttribute("placeholder") || "",
      field.getAttribute("data-automation-id") || "",
      field.getAttribute("data-testid") || "",
    );
    return normalize(parts.join(" "));
  }

  function elementMarker(element) {
    if (!(element instanceof Element)) return "";
    return normalize([
      element.getAttribute("data-automation-id") || "",
      element.getAttribute("data-testid") || "",
      element.getAttribute("aria-label") || "",
      element.id || "",
      element.getAttribute("class") || "",
    ].join(" "));
  }

  function experienceDescriptor(field) {
    const parts = [labelText(field)];
    let node = field.parentElement;
    for (let depth = 0; node && depth < 3; depth += 1, node = node.parentElement) parts.push(elementMarker(node));
    return normalize(parts.join(" "));
  }

  function findExperienceRoots(fields) {
    const roots = new Set();
    const markers = [...document.querySelectorAll("h1, h2, h3, h4, legend, [role='heading'], [data-automation-id], [data-testid]")];
    for (const marker of markers) {
      const markerText = normalize(`${elementMarker(marker)} ${marker.textContent && marker.textContent.length < 140 ? marker.textContent : ""}`);
      if (!experienceContextPattern.test(markerText)) continue;
      let node = marker;
      for (let depth = 0; node?.parentElement && depth < 7; depth += 1, node = node.parentElement) {
        const count = fields.filter((field) => node.contains(field)).length;
        if (count >= 2) {
          roots.add(node);
          break;
        }
      }
    }
    return [...roots];
  }

  function experienceKeyFor(field, descriptor) {
    if (blockedField.test(descriptor)) return "";
    const explicit = experienceFieldRules.find(([, pattern]) => pattern.test(descriptor))?.[0] || "";
    if (explicit) return explicit;
    const type = field instanceof HTMLInputElement ? (field.type || "text").toLowerCase() : "";
    if (type === "month" && /start|from|begin|开始|入职/i.test(descriptor)) return "startDate";
    if (type === "month" && /end|to|finish|结束|离职/i.test(descriptor)) return "endDate";
    return "";
  }

  function profileKeyFor(field, descriptor) {
    if (/phone\s*(extension|ext\b)|extension\s*(number|phone)|电话分机|分机号码|phone\s*(device\s*)?type/i.test(descriptor)) return "";
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
    const targets = (Array.isArray(desired) ? desired : [desired]).map(normalize).filter(Boolean);
    const options = [...field.options];
    const match = options.find((option) => targets.some((target) => normalize(option.value) === target || normalize(option.textContent) === target))
      || options.find((option) => targets.some((target) => normalize(option.value).includes(target) || normalize(option.textContent).startsWith(target)));
    if (!match || match.disabled) return false;
    setNativeValue(field, match.value);
    return true;
  }

  function callingCode(profile) {
    const explicit = String(profile.phoneCountryCode || "").trim();
    if (explicit) return explicit.startsWith("+") ? explicit : `+${explicit}`;
    const country = normalize(profile.country);
    if (/^(canada|united states|usa|us|加拿大|美国)$/.test(country)) return "+1";
    if (/^(china|中国)$/.test(country)) return "+86";
    if (/^(united kingdom|uk|great britain|英国)$/.test(country)) return "+44";
    return "";
  }

  function hasSeparateCallingCode(fields, phoneField) {
    return fields.some((field) => field !== phoneField && profileKeyFor(field, labelText(field)) === "phoneCountryCode");
  }

  function profileValueFor(field, key, profile, fields) {
    if (key === "phoneCountryCode") {
      const code = callingCode(profile);
      const country = String(profile.country || "").trim();
      if (!code) return "";
      return field instanceof HTMLSelectElement ? [country && `${country} (${code})`, country && `${country} ${code}`, code].filter(Boolean) : code;
    }
    const raw = String(profile[key] || "").trim();
    if (key !== "phone" || !raw || !hasSeparateCallingCode(fields, field)) return raw;
    const digits = raw.replace(/\D/g, "");
    const codeDigits = callingCode(profile).replace(/\D/g, "");
    return codeDigits && digits.startsWith(codeDigits) ? digits.slice(codeDigits.length) : digits;
  }

  function experienceValue(experience, key, field) {
    if (["company", "title", "location", "description"].includes(key)) return String(experience[key] || "").trim();
    const source = key.startsWith("start") ? experience.startMonth : experience.endMonth;
    const match = String(source || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) return "";
    const [, year, month] = match;
    if (key.endsWith("Year")) return year;
    if (key.endsWith("MonthPart")) return monthNames[Number(month) - 1] || [month];
    if (field instanceof HTMLInputElement && field.type === "date") return `${year}-${month}-01`;
    if (field instanceof HTMLInputElement && field.type === "month") return `${year}-${month}`;
    if (field instanceof HTMLSelectElement) return monthNames[Number(month) - 1] || [month];
    return `${month}/${year}`;
  }

  function findEntryContainer(candidate, candidates, roots) {
    let node = candidate.field.parentElement;
    let fallback = null;
    for (let depth = 0; node && node !== document.body && depth < 9; depth += 1, node = node.parentElement) {
      const inside = candidates.filter((item) => node.contains(item.field));
      const keys = new Set(inside.map((item) => item.key));
      if (keys.size < 2) continue;
      const companyCount = inside.filter((item) => item.key === "company").length;
      const titleCount = inside.filter((item) => item.key === "title").length;
      if (companyCount > 1 || titleCount > 1 || companyCount + titleCount === 0) continue;
      fallback ||= node;
      const hasDetails = inside.some((item) => /^(start|end|current|description)/.test(item.key));
      if (hasDetails) return node;
    }
    return fallback || roots.find((root) => root.contains(candidate.field)) || candidate.field.parentElement;
  }

  function orderedGroups(candidates, roots) {
    const preliminary = new Map();
    for (const candidate of candidates) {
      const container = findEntryContainer(candidate, candidates, roots);
      if (!preliminary.has(container)) preliminary.set(container, []);
      preliminary.get(container).push(candidate);
    }
    const containers = [...preliminary.keys()];
    const safeContainer = (container) => {
      const inside = candidates.filter((item) => container.contains(item.field));
      return new Set(inside.map((item) => item.key)).size >= 2
        && inside.filter((item) => item.key === "company").length <= 1
        && inside.filter((item) => item.key === "title").length <= 1;
    };
    const groupMap = new Map();
    for (const candidate of candidates) {
      let container = findEntryContainer(candidate, candidates, roots);
      for (const possible of containers) {
        if (possible !== container && possible.contains(container) && safeContainer(possible)) container = possible;
      }
      if (!groupMap.has(container)) groupMap.set(container, []);
      groupMap.get(container).push(candidate);
    }
    return [...groupMap.entries()]
      .map(([container, items]) => ({ container, items }))
      .sort((a, b) => a.container.compareDocumentPosition(b.container) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  }

  function findAddExperienceButton(roots) {
    const directPattern = /add\s+(another\s+)?((work|employment|professional)\s+)?experience|添加.*(工作|就业|职业).*经历/i;
    const contextualPattern = /^add(\s+another)?(\s+(job|position|entry))?$|^(添加|新增)(另一段|一段)?$/i;
    const buttons = [...document.querySelectorAll("button, [role='button'], input[type='button']")]
      .filter((button) => !button.disabled && !button.closest("[hidden], [aria-hidden='true']"));
    const label = (button) => normalize(`${button.textContent || ""} ${button.getAttribute("aria-label") || ""} ${button instanceof HTMLInputElement ? button.value : ""}`);
    return buttons.find((button) => directPattern.test(label(button)))
      || buttons.find((button) => contextualPattern.test(label(button)) && roots.some((root) => root.contains(button)))
      || null;
  }

  function fillWorkExperiences(fields, profile) {
    const experiences = Array.isArray(profile.workExperiences)
      ? profile.workExperiences.filter((experience) => experience && typeof experience === "object" && Object.values(experience).some(Boolean))
      : [];
    if (!experiences.length) return { filled: 0, matchedKeys: [], handledFields: new Set(), added: false };

    const roots = findExperienceRoots(fields);
    const candidates = [];
    for (const field of fields) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) continue;
      if (field.disabled || field.readOnly || field.closest("[hidden], [aria-hidden='true']")) continue;
      const descriptor = experienceDescriptor(field);
      const key = experienceKeyFor(field, descriptor);
      if (!key) continue;
      const hasContext = experienceContextPattern.test(descriptor) || roots.some((root) => root.contains(field));
      if (!hasContext) continue;
      candidates.push({ field, key, descriptor });
    }

    const groups = orderedGroups(candidates, roots);
    const handledFields = new Set(candidates.map((candidate) => candidate.field));
    const matchedKeys = [];
    let filled = 0;

    groups.slice(0, experiences.length).forEach((group, index) => {
      const experience = experiences[index];
      for (const { field, key } of group.items) {
        if (key === "current") {
          if (experience.current && field instanceof HTMLInputElement && field.type === "checkbox" && !field.checked) {
            field.click();
            filled += 1;
            matchedKeys.push(`workExperiences.${index}.current`);
          }
          continue;
        }
        if (String(field.value || "").trim()) continue;
        if (experience.current && key.startsWith("end")) continue;
        const desired = experienceValue(experience, key, field);
        if (!desired || (Array.isArray(desired) && !desired.length)) continue;
        const success = field instanceof HTMLSelectElement ? fillSelect(field, desired) : (setNativeValue(field, desired), true);
        if (success) {
          filled += 1;
          matchedKeys.push(`workExperiences.${index}.${key}`);
        }
      }
    });

    let added = false;
    if (groups.length < experiences.length) {
      const addButton = findAddExperienceButton(roots);
      const now = Date.now();
      if (addButton && (experienceAddState.groupCount !== groups.length || now - experienceAddState.time > 1800)) {
        experienceAddState = { groupCount: groups.length, time: now };
        addButton.click();
        added = true;
        window.setTimeout(() => { void fillPage(); }, 700);
      }
    }
    return { filled, matchedKeys, handledFields, added };
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
    const experienceResult = fillWorkExperiences(fields, profile);
    let filled = experienceResult.filled;
    const matchedKeys = [...experienceResult.matchedKeys];

    for (const field of fields) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) continue;
      if (experienceResult.handledFields.has(field)) continue;
      if (field.disabled || field.readOnly || field.closest("[hidden], [aria-hidden='true']")) continue;
      if (field instanceof HTMLInputElement && ignoredTypes.has((field.type || "text").toLowerCase())) continue;
      if (String(field.value || "").trim()) continue;
      const descriptor = labelText(field);
      if (!descriptor || blockedField.test(descriptor)) continue;
      const key = profileKeyFor(field, descriptor);
      const desired = key ? profileValueFor(field, key, profile, fields) : "";
      if (!desired) continue;
      const success = field instanceof HTMLSelectElement ? fillSelect(field, desired) : (setNativeValue(field, desired), true);
      if (success) {
        filled += 1;
        matchedKeys.push(key);
      }
    }

    if (filled > 0) showToast(`MAP 已填写 ${filled} 个空白字段，请检查后再继续。`);
    else if (experienceResult.added) showToast("MAP 正在展开下一段工作经历，稍后会继续填写。");
    else if (announceEmpty) showToast("没有找到可安全自动填写的空白字段。");
    return { ok: true, filled, matchedKeys: [...new Set(matchedKeys)], scanned: fields.length, addedExperience: experienceResult.added };
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
