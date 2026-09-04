const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("token colors", () => {
  it("assigns unique indexes in first-seen order and keeps a handle stable", async () => {
    const { assignTokenColors } = await import("../lib/token-colors.mjs");
    const map = assignTokenColors(["Ada", "Bea", "Ada", "Cyd", "", null, "Bea"]);
    assert.equal(map.Ada, 0);
    assert.equal(map.Bea, 1);
    assert.equal(map.Cyd, 2);
    assert.equal(Object.keys(map).length, 3);
    const again = assignTokenColors(["Ada", "Bea", "Cyd"]);
    assert.equal(again.Ada, map.Ada);
    assert.equal(again.Bea, map.Bea);
    assert.equal(again.Cyd, map.Cyd);
  });

  it("skips blank handles and still unique past the named palette", async () => {
    const { assignTokenColors, TOKEN_PALETTE_SIZE } = await import("../lib/token-colors.mjs");
    const handles = Array.from({ length: TOKEN_PALETTE_SIZE + 3 }, (_, i) => `p${i}`);
    const map = assignTokenColors(["", "  ", ...handles]);
    const indexes = handles.map((h) => map[h]);
    assert.equal(new Set(indexes).size, handles.length);
    assert.equal(map["p0"], 0);
    assert.equal(map[`p${TOKEN_PALETTE_SIZE}`], TOKEN_PALETTE_SIZE);
  });

  it("collects schedule then PCs then self, first-seen wins", async () => {
    const { collectPageHandles, assignTokenColors, tokenIndexFor } = await import("../lib/token-colors.mjs");
    const handles = collectPageHandles({
      times: [
        {
          id: "b",
          date: "2026-09-04",
          time: "19:00",
          participants: [
            { handle: "Bea", status: "maybe" },
            { handle: "Ada", status: "yes" }
          ]
        },
        {
          id: "a",
          date: "2026-09-03",
          time: "18:00",
          participants: [{ handle: "Ada", status: "yes" }]
        }
      ],
      pcs: [{ handle: "Cyd" }, { handle: "Ada" }],
      selfHandle: "Dee"
    });
    const map = assignTokenColors(handles);
    assert.equal(tokenIndexFor(map, "Ada"), 0);
    assert.equal(tokenIndexFor(map, "Bea"), 1);
    assert.equal(tokenIndexFor(map, "Cyd"), 2);
    assert.equal(tokenIndexFor(map, "Dee"), 3);
    assert.equal(tokenIndexFor(map, "nobody"), 0);
  });

  it("honors a saved token color and keeps other fills unique", async () => {
    const { assignTokenColors } = await import("../lib/token-colors.mjs");
    const map = assignTokenColors(["Ada", "Bea", "Cyd"], { Bea: 0, Cyd: 0 });
    assert.equal(map.Bea, 0);
    assert.equal(map.Ada, 1);
    assert.equal(map.Cyd, 2);
  });
});
