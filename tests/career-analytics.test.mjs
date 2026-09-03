import assert from "node:assert/strict";
import test from "node:test";
import { appendApplicationStage, buildCareerAnalytics, canonicalJobUrl, linkedinJobId, sameApplication } from "../lib/career-analytics.mjs";

test("LinkedIn search and detail links resolve to one stable job identity", () => {
  const searchUrl = "https://www.linkedin.com/jobs/search/?currentJobId=123456789&trackingId=secret";
  const detailUrl = "https://www.linkedin.com/jobs/view/123456789/?trk=public_jobs";
  assert.equal(linkedinJobId(searchUrl), "123456789");
  assert.equal(canonicalJobUrl(searchUrl), "https://www.linkedin.com/jobs/view/123456789/");
  assert.equal(canonicalJobUrl(detailUrl), "https://www.linkedin.com/jobs/view/123456789/");
  assert.equal(sameApplication({ link: searchUrl }, { link: detailUrl }), true);
});

test("stage changes append history without duplicating the same state", () => {
  const application = { id: "a", stage: "已投", stageHistory: [] };
  const applied = appendApplicationStage(application, "已投", "2026-09-01T12:00:00.000Z");
  const interview = appendApplicationStage(applied, "面试", "2026-09-03T12:00:00.000Z");
  const repeated = appendApplicationStage(interview, "面试", "2026-09-04T12:00:00.000Z");
  assert.deepEqual(repeated.stageHistory, [
    { stage: "已投", at: "2026-09-01T12:00:00.000Z" },
    { stage: "面试", at: "2026-09-03T12:00:00.000Z" },
  ]);
});

test("career analytics use recorded transitions and group by application week", () => {
  const applications = [
    { id: "a", date: "2026-09-01", stage: "拒绝", stageHistory: [{ stage: "已投", at: "2026-09-01T12:00:00.000Z" }, { stage: "面试", at: "2026-09-02T12:00:00.000Z" }, { stage: "拒绝", at: "2026-09-03T12:00:00.000Z" }] },
    { id: "b", date: "2026-09-02", stage: "Offer", stageHistory: [{ stage: "已投", at: "2026-09-02T12:00:00.000Z" }, { stage: "面试", at: "2026-09-03T12:00:00.000Z" }, { stage: "Offer", at: "2026-09-04T12:00:00.000Z" }] },
    { id: "c", date: "2026-09-08", stage: "已投", stageHistory: [{ stage: "已投", at: "2026-09-08T12:00:00.000Z" }] },
  ];
  const analytics = buildCareerAnalytics(applications);
  assert.equal(analytics.total, 3);
  assert.equal(analytics.reachedInterview, 2);
  assert.equal(analytics.reachedOffer, 1);
  assert.equal(analytics.rejected, 1);
  assert.equal(analytics.weekly.length, 2);
  assert.deepEqual(analytics.weekly[1], { start: "2026-08-31", end: "2026-09-06", total: 2, interviews: 2, offers: 1, rejected: 1, interviewRate: 100 });
});
