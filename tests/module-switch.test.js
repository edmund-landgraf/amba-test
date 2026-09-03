const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { copyRoster, provisionNewAdventure } = require("../lib/module-switch");

describe("module switch", () => {
  it("copies roster with empty votes and does not copy times or wg sheets", () => {
    const previous = {
      id: "amba-workflow-test-1",
      title: "The Palakar Convergence",
      targetPlayers: 4,
      format: "Remote",
      scope: "Short adventure",
      times: [{ id: "slot-1", createdBy: "a@b.com" }],
      signups: [
        {
          id: "s1",
          email: "A@B.com",
          handle: "Slippery-Signal",
          votes: { "slot-1": "yes" },
          voteNotes: { "slot-1": "late" },
          characterStatus: "ready"
        }
      ],
      wgSheets: [{ email: "a@b.com", sheets: [{ url: "https://example.test" }] }],
      promote: { posts: [{ id: "p1" }] }
    };
    const next = provisionNewAdventure(previous, { title: "A Different Module" }, new Set(["amba-workflow-test-1"]));
    assert.notEqual(next.id, previous.id);
    assert.equal(next.title, "A Different Module");
    assert.deepEqual(next.times, []);
    assert.deepEqual(next.wgSheets, []);
    assert.deepEqual(next.promote.posts, []);
    assert.equal(next.signups.length, 1);
    assert.equal(next.signups[0].email, "a@b.com");
    assert.equal(next.signups[0].handle, "Slippery-Signal");
    assert.deepEqual(next.signups[0].votes, {});
    assert.deepEqual(next.signups[0].voteNotes, {});
    assert.equal(previous.times.length, 1);
    assert.equal(previous.signups[0].votes["slot-1"], "yes");
  });

  it("copyRoster drops rows with no email", () => {
    assert.deepEqual(copyRoster([{ handle: "Nope" }, { email: "ok@ok.com", handle: "Ok" }]).map((row) => row.email), ["ok@ok.com"]);
  });
});
