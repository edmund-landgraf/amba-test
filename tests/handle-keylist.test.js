const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  HANDLE_PART_WINDOW,
  adjectives,
  nouns,
  adverbs,
  verbs,
  emptyKeylist,
  partsInWindow,
  createHandles,
  recordHandle,
  seedFromUsers,
  splitHandle,
  handleInitials,
  wordsFor
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

function localPair(handle) {
  const parts = splitHandle(handle);
  const left = parts.adjective.toLowerCase();
  const right = parts.noun.toLowerCase();
  const adjN = wordsFor("adj", "list").some((word) => word.toLowerCase() === left)
    && wordsFor("n", "list").some((word) => word.toLowerCase() === right);
  const advV = wordsFor("adv", "list").some((word) => word.toLowerCase() === left)
    && wordsFor("v", "list").some((word) => word.toLowerCase() === right);
  return { adjN, advV };
}

describe("handle keylist", () => {
  it("has at least 500 local words in each part of speech", () => {
    assert.ok(adjectives.length >= 500, `adj ${adjectives.length}`);
    assert.ok(nouns.length >= 500, `n ${nouns.length}`);
    assert.ok(adverbs.length >= 500, `adv ${adverbs.length}`);
    assert.ok(verbs.length >= 500, `v ${verbs.length}`);
  });

  it("does not mash prefix combos like Ambersage in local mode", () => {
    const prefixes = ["aero", "amber", "ashen", "azure", "boreal", "bright"];
    const all = new Set([...adjectives, ...nouns, ...adverbs, ...verbs].map((word) => word.toLowerCase()));
    function isMash(word) {
      const lower = String(word || "").toLowerCase();
      return prefixes.some((prefix) => {
        if (!lower.startsWith(prefix) || lower.length < prefix.length + 4) return false;
        return all.has(lower.slice(prefix.length));
      });
    }
    for (const word of all) assert.equal(isMash(word), false, word);
    const mashedBatch = createHandles(emptyKeylist(), [], 40, { source: "list" });
    for (const handle of mashedBatch) {
      const [left, right] = handle.split("-");
      assert.equal(isMash(left), false, handle);
      assert.equal(isMash(right), false, handle);
    }
  });

  it("pairs only adjective-noun or adverb-verb in local mode", () => {
    const batch = createHandles(emptyKeylist(), [], 40, { source: "list" });
    assert.equal(batch.length, 40);
    assert.equal(new Set(batch.map((handle) => handle.toLowerCase())).size, 40);
    let adjNoun = 0;
    let advVerb = 0;
    for (const handle of batch) {
      assert.match(handle, /^[A-Z][a-z]{3,13}-[A-Z][a-z]{3,13}$/);
      const pair = localPair(handle);
      assert.equal(pair.adjN || pair.advV, true, handle);
      if (pair.adjN) adjNoun += 1;
      if (pair.advV && !pair.adjN) advVerb += 1;
    }

    const adjOnly = createHandles(emptyKeylist(), [], 12, { source: "list", pattern: ["adj", "n"] });
    for (const handle of adjOnly) assert.equal(localPair(handle).adjN, true, handle);
    const advOnly = createHandles(emptyKeylist(), [], 12, { source: "list", pattern: ["adv", "v"] });
    for (const handle of advOnly) assert.equal(localPair(handle).advV, true, handle);
    assert.ok(adjNoun + advVerb >= 40);
  });

  it("gives the four picker options distinct two-letter initials", () => {
    const batch = createHandles(emptyKeylist(), [], 4, { source: "list" });
    const letters = batch.map((handle) => handleInitials(handle));
    assert.equal(letters.length, 4);
    assert.equal(new Set(letters).size, 4);
  });

  it("keeps SS off this sheet's picker when Slippery-Signal is already signed up", () => {
    const keylist = emptyKeylist();
    recordHandle(keylist, "Slippery-Signal");
    const batch = createHandles(keylist, [{ handle: "Slippery-Signal" }], 4, {
      source: "list",
      initials: new Set(["SS"])
    });
    for (const handle of batch) {
      assert.notEqual(handleInitials(handle), "SS", handle);
    }
  });

  it("allows SS again when the signup sheet is empty", () => {
    const elsewhere = emptyKeylist();
    recordHandle(elsewhere, "Slippery-Signal");
    let found = false;
    for (let i = 0; i < 300; i += 1) {
      const [handle] = createHandles(elsewhere, [{ handle: "Slippery-Signal" }], 1, {
        source: "list",
        pattern: ["adj", "n"],
        initials: new Set()
      });
      if (handleInitials(handle) === "SS") {
        found = true;
        break;
      }
    }
    assert.equal(found, true);
  });

  it("keeps Slippery and Signal out of the next assigned handles", () => {
    const keylist = emptyKeylist();
    recordHandle(keylist, "Slippery-Signal");
    const blocked = partsInWindow(keylist);
    assert.equal(blocked.adjectives.has("slippery"), true);
    assert.equal(blocked.nouns.has("signal"), true);

    const batch = createHandles(keylist, [{ handle: "Slippery-Signal" }], 4, { source: "list" });
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
