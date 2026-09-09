const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  HANDLE_PART_WINDOW,
  adjectives,
  nouns,
  emptyKeylist,
  partsInWindow,
  createHandles,
  recordHandle,
  seedFromUsers,
  splitHandle
} = require("../lib/handle-keylist");

function partsOf(handles) {
  const adjectivesUsed = [];
  const nounsUsed = [];
  for (const handle of handles) {
    const parts = splitHandle(handle);
    adjectivesUsed.push(parts.adjective);
    nounsUsed.push(parts.noun);
  }
  return { adjectivesUsed, nounsUsed };
}

describe("handle keylist", () => {
  it("has more than 1000 adjective and noun parts", () => {
    assert.ok(adjectives.length > HANDLE_PART_WINDOW);
    assert.ok(nouns.length > HANDLE_PART_WINDOW);
  });

  it("keeps Slippery and Signal out of the next 1000 assigned handles", () => {
    const keylist = emptyKeylist();
    recordHandle(keylist, "Slippery-Signal");
    const blocked = partsInWindow(keylist);
    assert.equal(blocked.adjectives.has("slippery"), true);
    assert.equal(blocked.nouns.has("signal"), true);

    const batch = createHandles(keylist, [{ handle: "Slippery-Signal" }], 4);
    const { adjectivesUsed, nounsUsed } = partsOf(batch);
    assert.equal(adjectivesUsed.some((word) => word.toLowerCase() === "slippery"), false);
    assert.equal(nounsUsed.some((word) => word.toLowerCase() === "signal"), false);
    assert.equal(new Set(adjectivesUsed.map((word) => word.toLowerCase())).size, 4);
    assert.equal(new Set(nounsUsed.map((word) => word.toLowerCase())).size, 4);

    const adjPool = adjectives.filter((word) => word.toLowerCase() !== "slippery");
    const nounPool = nouns.filter((word) => word.toLowerCase() !== "signal");
    for (let i = 0; i < HANDLE_PART_WINDOW - 1; i += 1) {
      recordHandle(keylist, `${adjPool[i % adjPool.length]}-${nounPool[(i + 17) % nounPool.length]}`);
    }
    assert.equal(partsInWindow(keylist).adjectives.has("slippery"), true);

    recordHandle(keylist, `${adjPool[10]}-${nounPool[10]}`);
    assert.equal(partsInWindow(keylist).adjectives.has("slippery"), false);
    assert.equal(partsInWindow(keylist).nouns.has("signal"), false);
    assert.ok(keylist.entries.length <= HANDLE_PART_WINDOW);
  });

  it("seeds existing user handles into the keylist once", () => {
    const keylist = emptyKeylist();
    seedFromUsers(keylist, [
      { handle: "Velvet-Compass", createdAt: "2026-01-01" },
      { handle: "Velvet-Compass", createdAt: "2026-01-02" }
    ]);
    assert.equal(keylist.rotation, 1);
    assert.equal(keylist.entries[0].adjective, "Velvet");
    assert.equal(keylist.entries[0].noun, "Compass");
    seedFromUsers(keylist, [{ handle: "Velvet-Compass" }]);
    assert.equal(keylist.rotation, 1);
  });
});
