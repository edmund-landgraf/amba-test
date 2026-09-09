const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("live countdown", () => {
  it("picks the live session closest in time, preferring an upcoming start over a past one", async () => {
    const { pickNextLiveStart } = await import("../lib/live-countdown.mjs");
    const now = Date.parse("2026-09-10T12:00:00.000Z");
    const start = pickNextLiveStart([
      { scheduledToPlay: true, startIso: "2026-09-10T11:00:00.000Z" },
      { scheduledToPlay: true, startIso: "2026-09-10T18:00:00.000Z" },
      { scheduledToPlay: false, startIso: "2026-09-10T12:05:00.000Z" }
    ], now);
    assert.equal(start, Date.parse("2026-09-10T18:00:00.000Z"));
  });

  it("picks the nearer of two upcoming live sessions", async () => {
    const { pickNextLiveStart } = await import("../lib/live-countdown.mjs");
    const now = Date.parse("2026-09-10T12:00:00.000Z");
    const start = pickNextLiveStart([
      { scheduledToPlay: true, startIso: "2026-09-12T12:00:00.000Z" },
      { scheduledToPlay: true, startIso: "2026-09-10T14:00:00.000Z" }
    ], now);
    assert.equal(start, Date.parse("2026-09-10T14:00:00.000Z"));
  });

  it("hides the timer when no live session is upcoming", async () => {
    const { pickNextLiveStart } = await import("../lib/live-countdown.mjs");
    const now = Date.parse("2026-09-10T12:00:00.000Z");
    assert.equal(pickNextLiveStart([
      { scheduledToPlay: true, startIso: "2026-09-09T12:00:00.000Z" }
    ], now), null);
    assert.equal(pickNextLiveStart([], now), null);
  });

  it("formats remaining time as days, hours, minutes, and seconds", async () => {
    const { formatCountdown } = await import("../lib/live-countdown.mjs");
    assert.equal(
      formatCountdown((((1 * 24) + 2) * 3600 + 3 * 60 + 4) * 1000),
      "1 day, 2 hours, 3 minutes, 4 seconds"
    );
    assert.equal(formatCountdown(0), "0 days, 0 hours, 0 minutes, 0 seconds");
    assert.equal(formatCountdown(-5000), "0 days, 0 hours, 0 minutes, 0 seconds");
    const { countdownParts } = await import("../lib/live-countdown.mjs");
    assert.deepEqual(countdownParts((((1 * 24) + 2) * 3600 + 3 * 60 + 4) * 1000), [
      "1 day",
      "2 hours",
      "3 minutes",
      "4 seconds"
    ]);
  });
});
