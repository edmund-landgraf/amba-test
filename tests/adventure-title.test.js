const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  displayAdventureTitle,
  isArtifactTitle,
  adoptScrapedTitle,
  moduleTitleFromSyndication,
  titleFromDocumentTitle
} = require("../lib/adventure-title");

describe("adventure title", () => {
  it("reads the module name from synd-brand, not the Player Hook node", () => {
    const html = `
      <title>Player Hook - The Fivefold Horizon · Player syndication | AMBA</title>
      <h1>Player Hook</h1>
      <a class="synd-brand" href="/syndicate/OT-1HkTSFJ4DSQmdWxNFLA">The Fivefold Horizon</a>
    `;
    assert.equal(moduleTitleFromSyndication(html), "The Fivefold Horizon");
  });

  it("parses the adventure-summary page title when brand is missing", () => {
    assert.equal(
      titleFromDocumentTitle("Player Hook – The Fivefold Horizon · Player syndication | AMBA"),
      "The Fivefold Horizon"
    );
    assert.equal(isArtifactTitle("Player Hook"), true);
    assert.equal(displayAdventureTitle("The Fivefold Horizon (PF2e)"), "The Fivefold Horizon");
  });

  it("does not replace a real module title with a stale syndication brand", () => {
    assert.equal(
      adoptScrapedTitle("The Price of Prophecy (Production)", "The Palakar Convergence"),
      ""
    );
    assert.equal(adoptScrapedTitle("Player Hook", "The Price of Prophecy"), "The Price of Prophecy");
    assert.equal(adoptScrapedTitle("", "The Palakar Convergence"), "The Palakar Convergence");
  });
});
