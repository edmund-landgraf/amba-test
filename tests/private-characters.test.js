const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  ensurePrivateCharacterOption,
  publicPrivateCharacter,
  removePrivateCharacterOption
} = require("../lib/private-characters");

describe("private WG character options", () => {
  it("stores private choices as masked party entries", () => {
    const pack = { email: "player@example.com", sheets: [] };
    const sheet = ensurePrivateCharacterOption(pack, "mystery.zip", {
      maxPcsPerPlayer: 2,
      now: "2026-09-03T12:00:00.000Z"
    });

    assert.equal(sheet.name, "Private character");
    assert.equal(sheet.abc, "Hidden");
    assert.equal(sheet.level, "Hidden");
    assert.equal(sheet.privateExportName, "mystery.zip");
    assert.equal(sheet.inParty, true);
    assert.deepEqual(publicPrivateCharacter(sheet, "Merry-Anchor"), {
      type: "private",
      privateExportName: "mystery.zip",
      url: "",
      id: "",
      name: "Private character",
      abc: "Hidden",
      level: "Hidden",
      imageUrl: "",
      handle: "Merry-Anchor",
      inParty: true,
      error: ""
    });
  });

  it("counts public and private options together for the six character cap", () => {
    const pack = {
      email: "player@example.com",
      sheets: Array.from({ length: 6 }, (_, index) => ({
        url: `https://wgui.wandersguide.site/sheet/${index + 1}`,
        inParty: false
      }))
    };

    assert.throws(() => {
      ensurePrivateCharacterOption(pack, "seventh.zip", { maxPcsPerPlayer: 6 });
    }, /sheet_limit/);
  });

  it("counts public and private choices together for the party consideration limit", () => {
    const pack = {
      email: "player@example.com",
      sheets: [
        { url: "https://wgui.wandersguide.site/sheet/1", inParty: true }
      ]
    };

    assert.throws(() => {
      ensurePrivateCharacterOption(pack, "backup.zip", { maxPcsPerPlayer: 1 });
    }, /party_per_player_limit/);
  });

  it("can save a private option outside the party list when waitlisting is allowed", () => {
    const pack = {
      email: "player@example.com",
      sheets: [
        { url: "https://wgui.wandersguide.site/sheet/1", inParty: true }
      ]
    };

    const sheet = ensurePrivateCharacterOption(pack, "backup.zip", {
      allowWaitlist: true,
      maxPcsPerPlayer: 1
    });

    assert.equal(sheet.inParty, false);
    assert.equal(pack.sheets.length, 2);
  });

  it("removes only the matching private archive association", () => {
    const pack = {
      email: "player@example.com",
      sheets: [
        { privateExportName: "one.zip", type: "private" },
        { privateExportName: "two.zip", type: "private" },
        { url: "https://wgui.wandersguide.site/sheet/1" }
      ]
    };

    assert.equal(removePrivateCharacterOption(pack, "one.zip"), true);
    assert.deepEqual(pack.sheets.map((sheet) => sheet.privateExportName || sheet.url), [
      "two.zip",
      "https://wgui.wandersguide.site/sheet/1"
    ]);
  });
});
