import { test } from "node:test";
import assert from "node:assert/strict";
import { impactScore, priority, quadrant, urgency, mentionsRisk, mode } from "../src/lib/scoring";

const NOW = new Date("2026-10-23T09:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

test("impact stays between 1 and 10", () => {
  const low = impactScore({ people: 0, schools: 0, severity: 0, last14: 0, prev14: 0, fitsGoals: false });
  const high = impactScore({ people: 500, schools: 100, severity: 4, last14: 50, prev14: 0, fitsGoals: true });
  assert.ok(low.impact >= 1 && low.impact <= 10);
  assert.equal(high.impact, 10);
});

test("more people, worse severity and rising volume all raise impact", () => {
  const base = { people: 5, schools: 2, severity: 2, last14: 3, prev14: 3, fitsGoals: false };
  const b = impactScore(base).impact;
  assert.ok(impactScore({ ...base, people: 20 }).impact > b);
  assert.ok(impactScore({ ...base, severity: 4 }).impact > b);
  assert.ok(impactScore({ ...base, last14: 9 }).impact > b);
  assert.ok(impactScore({ ...base, fitsGoals: true }).impact > b);
});

test("priority is impact divided by effort weight (spec example)", () => {
  assert.equal(priority(8, "s"), 8);
  assert.equal(priority(9, "l"), 2.25);
  assert.equal(priority(8, null), null);
  assert.equal(priority(null, "m"), null);
});

test("quadrants split at impact 6 and between M and L", () => {
  assert.equal(quadrant(6, "m"), "quick_win");
  assert.equal(quadrant(6, "l"), "big_bet");
  assert.equal(quadrant(5.9, "s"), "fill_in");
  assert.equal(quadrant(2, "xl"), "not_worth_it");
});

test("critical report in the last 14 days is urgent", () => {
  const u = urgency({ isClosed: false, regressed: false, criticalAt: [daysAgo(3)], riskAt: [], reportDates: [daysAgo(3)], clearedAt: null, fixedAt: null, now: NOW });
  assert.equal(u.urgent, true);
  assert.match(u.reason ?? "", /critical/);
});

test("an old critical report is not urgent", () => {
  const u = urgency({ isClosed: false, regressed: false, criticalAt: [daysAgo(30)], riskAt: [], reportDates: [daysAgo(30)], clearedAt: null, fixedAt: null, now: NOW });
  assert.equal(u.urgent, false);
});

test("five reports in 24 hours is a spike", () => {
  const dates = [0.1, 0.2, 0.3, 0.5, 0.9].map(daysAgo);
  const u = urgency({ isClosed: false, regressed: false, criticalAt: [], riskAt: [], reportDates: dates, clearedAt: null, fixedAt: null, now: NOW });
  assert.equal(u.urgent, true);
  assert.match(u.reason ?? "", /24 hours/);
});

test("clearing the flag holds until a newer signal arrives", () => {
  const base = { isClosed: false, regressed: false, riskAt: [], fixedAt: null, now: NOW };
  const cleared = urgency({ ...base, criticalAt: [daysAgo(3)], reportDates: [daysAgo(3)], clearedAt: daysAgo(1) });
  assert.equal(cleared.urgent, false);
  const again = urgency({ ...base, criticalAt: [daysAgo(3), daysAgo(0.5)], reportDates: [daysAgo(3), daysAgo(0.5)], clearedAt: daysAgo(1) });
  assert.equal(again.urgent, true);
});

test("closed issues are never urgent", () => {
  const u = urgency({ isClosed: true, regressed: true, criticalAt: [daysAgo(1)], riskAt: [], reportDates: [daysAgo(1)], clearedAt: null, fixedAt: null, now: NOW });
  assert.equal(u.urgent, false);
});

test("data loss wording is recognised", () => {
  assert.ok(mentionsRisk("I pressed save and lost all the marks"));
  assert.ok(mentionsRisk("attendance disappeared after saving"));
  assert.ok(!mentionsRisk("please add dark mode"));
});

test("mode picks the most common product area", () => {
  assert.equal(mode(["Marks", "Attendance", "Attendance", null]), "Attendance");
  assert.equal(mode([null, undefined]), null);
});
