export function extractLinkedInJob() {
  const isLinkedInJobsPage = window.location.protocol === "https:"
    && /(^|\.)linkedin\.com$/i.test(window.location.hostname)
    && window.location.pathname.startsWith("/jobs/");
  if (!isLinkedInJobsPage) return { unsupported: true };

  const compact = (value, limit = 100_000) => String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, limit);
  const firstText = (selectors, limit) => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = compact(element?.textContent, limit);
      if (value) return value;
    }
    return "";
  };
  const htmlToText = (html) => {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    template.content.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
    template.content.querySelectorAll("li").forEach((node) => node.prepend("• "));
    return compact(template.content.textContent);
  };
  const findJobPosting = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) { const found = findJobPosting(item); if (found) return found; }
      return null;
    }
    if (!value || typeof value !== "object") return null;
    const type = value["@type"];
    if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return value;
    for (const nested of Object.values(value)) { const found = findJobPosting(nested); if (found) return found; }
    return null;
  };
  let structured = null;
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { structured = findJobPosting(JSON.parse(script.textContent || "null")); } catch { /* ignore malformed page metadata */ }
    if (structured) break;
  }

  const href = window.location.href;
  const pathId = window.location.pathname.match(/\/jobs\/view\/(\d+)/)?.[1];
  const queryId = new URL(href).searchParams.get("currentJobId")?.match(/^\d+$/)?.[0];
  const externalJobId = pathId || queryId || "";
  const link = externalJobId ? `https://www.linkedin.com/jobs/view/${externalJobId}/` : href;
  const structuredLocation = structured?.jobLocation?.address || structured?.jobLocation?.[0]?.address || {};
  const locationParts = [structuredLocation.addressLocality, structuredLocation.addressRegion, structuredLocation.addressCountry].filter(Boolean);
  const rawLocation = firstText([
    ".job-details-jobs-unified-top-card__primary-description-container",
    ".jobs-unified-top-card__bullet",
    ".topcard__flavor--bullet",
    "main [class*='primary-description-container']",
  ], 500);
  const location = compact(locationParts.join(", ") || rawLocation.split("·")[0], 300);
  const pageTitle = compact(document.title.replace(/\s*\|\s*LinkedIn.*$/i, ""), 240);
  const role = compact(structured?.title, 240) || firstText([
    "h1.job-details-jobs-unified-top-card__job-title",
    ".job-details-jobs-unified-top-card__job-title h1",
    ".jobs-unified-top-card__job-title",
    ".top-card-layout__title",
    "main h1",
  ], 240) || pageTitle;
  const company = compact(structured?.hiringOrganization?.name, 180) || firstText([
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    ".jobs-unified-top-card__company-name",
    ".topcard__org-name-link",
    "main a[href*='/company/']",
  ], 180);
  const description = htmlToText(structured?.description) || firstText([
    "#job-details",
    ".jobs-description__content",
    ".jobs-description-content__text",
    ".show-more-less-html__markup",
    "main [class*='jobs-description']",
  ], 80_000);

  return {
    company,
    role,
    link,
    location,
    description,
    externalJobId,
    capturedAt: new Date().toISOString(),
    warnings: [
      !role ? "没有识别到岗位名称" : "",
      !company ? "没有识别到公司名称" : "",
      !description ? "没有识别到岗位描述，请确认已打开完整岗位详情" : "",
    ].filter(Boolean),
  };
}
