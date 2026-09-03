const APPLICATION_STAGES = new Set(["已投", "面试", "Offer", "拒绝"]);

function normalizedText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLocaleLowerCase() : "";
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function linkedinJobId(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    const pathMatch = url.pathname.match(/\/jobs\/view\/(\d+)/);
    return pathMatch?.[1] || url.searchParams.get("currentJobId")?.match(/^\d+$/)?.[0] || "";
  } catch {
    return value.match(/\/jobs\/view\/(\d+)/)?.[1] || value.match(/[?&]currentJobId=(\d+)/)?.[1] || "";
  }
}

export function canonicalJobUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const jobId = linkedinJobId(value);
  if (jobId) return `https://www.linkedin.com/jobs/view/${jobId}/`;
  try {
    const url = new URL(value);
    url.hash = "";
    ["trk", "trackingId", "refId", "midToken", "midSig"].forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function sameApplication(left, right) {
  const leftId = String(left?.externalJobId || linkedinJobId(left?.link || ""));
  const rightId = String(right?.externalJobId || linkedinJobId(right?.link || ""));
  if (leftId && rightId) return leftId === rightId;

  const leftLink = canonicalJobUrl(left?.link || "");
  const rightLink = canonicalJobUrl(right?.link || "");
  if (leftLink && rightLink) return leftLink === rightLink;

  const leftCompany = normalizedText(left?.company);
  const rightCompany = normalizedText(right?.company);
  const leftRole = normalizedText(left?.role);
  const rightRole = normalizedText(right?.role);
  return Boolean(leftCompany && rightCompany && leftRole && rightRole && leftCompany === rightCompany && leftRole === rightRole);
}

export function appendApplicationStage(application, nextStage, at = new Date().toISOString()) {
  if (!APPLICATION_STAGES.has(nextStage)) return application;
  const history = Array.isArray(application?.stageHistory)
    ? application.stageHistory.filter((event) => event && APPLICATION_STAGES.has(event.stage) && typeof event.at === "string")
    : [];
  if (history.at(-1)?.stage !== nextStage) history.push({ stage: nextStage, at });
  return { ...application, stage: nextStage, stageHistory: history };
}

function mondayOf(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function shiftDays(dateString, distance) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + distance);
  return date.toISOString().slice(0, 10);
}

function reachedStage(application, stage) {
  if (application?.stage === stage) return true;
  if (stage === "面试" && application?.stage === "Offer") return true;
  return Array.isArray(application?.stageHistory) && application.stageHistory.some((event) => event?.stage === stage);
}

export function buildCareerAnalytics(applications, maxRows = 8) {
  const records = Array.isArray(applications) ? applications : [];
  const total = records.length;
  const reachedInterview = records.filter((application) => reachedStage(application, "面试")).length;
  const reachedOffer = records.filter((application) => reachedStage(application, "Offer")).length;
  const rejected = records.filter((application) => application?.stage === "拒绝").length;
  const active = records.filter((application) => application?.stage === "已投" || application?.stage === "面试").length;
  const groups = new Map();

  for (const application of records) {
    if (!validDate(application?.date)) continue;
    const start = mondayOf(application.date);
    const row = groups.get(start) || { start, end: shiftDays(start, 6), total: 0, interviews: 0, offers: 0, rejected: 0 };
    row.total += 1;
    if (reachedStage(application, "面试")) row.interviews += 1;
    if (reachedStage(application, "Offer")) row.offers += 1;
    if (application.stage === "拒绝") row.rejected += 1;
    groups.set(start, row);
  }

  const weekly = [...groups.values()]
    .sort((left, right) => right.start.localeCompare(left.start))
    .slice(0, Math.max(1, maxRows))
    .map((row) => ({ ...row, interviewRate: row.total ? Math.round((row.interviews / row.total) * 100) : 0 }));

  return {
    total,
    reachedInterview,
    reachedOffer,
    rejected,
    active,
    interviewRate: total ? Math.round((reachedInterview / total) * 100) : 0,
    offerRate: total ? Math.round((reachedOffer / total) * 100) : 0,
    weekly,
    undated: records.filter((application) => !validDate(application?.date)).length,
  };
}
