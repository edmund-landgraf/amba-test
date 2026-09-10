const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("WG URL clipboard text", () => {
  it("joins public sheet URLs with CRLF and skips private or empty rows", async () => {
    const { wgUrlsClipboardText } = await import("../lib/wg-urls.mjs");
    assert.equal(wgUrlsClipboardText([]), "");
    assert.equal(
      wgUrlsClipboardText([
        { url: "https://wgui.wandersguide.site/sheet/a" },
        { url: "", name: "Private character" },
        { url: "  https://wgui.wandersguide.site/sheet/b  " }
      ]),
      "https://wgui.wandersguide.site/sheet/a\r\nhttps://wgui.wandersguide.site/sheet/b"
    );
  });
});
