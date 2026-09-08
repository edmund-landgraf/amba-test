const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("session email", () => {
  it("prefers ?email= over stored email and normalizes it", async () => {
    const { resolveSessionEmail } = await import("../lib/session-email.mjs");
    assert.equal(
      resolveSessionEmail("old@example.com", "?email=Edmund.Landgraf%40gmail.com"),
      "edmund.landgraf@gmail.com"
    );
    assert.equal(resolveSessionEmail("stored@example.com", ""), "stored@example.com");
    assert.equal(resolveSessionEmail("", "?foo=1"), "");
  });

  it("strips credentials from the address bar but keeps ordinary params", async () => {
    const { strippedSessionUrl } = await import("../lib/session-email.mjs");
    assert.equal(
      strippedSessionUrl("http://x/index.html?email=a%40b.com"),
      "/index.html"
    );
    assert.equal(
      strippedSessionUrl("http://x/index.html?password=AmbaAdminOK"),
      "/index.html"
    );
    assert.equal(
      strippedSessionUrl("http://x/index.html?tab=videos&token=abc#hook"),
      "/index.html?tab=videos#hook"
    );
    assert.equal(strippedSessionUrl("http://x/index.html?tab=videos"), "");
  });
});

describe("credential forms", () => {
  it("never submits natively to a URL", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = fs.readFileSync(path.join(__dirname, "..", "header.js"), "utf8");
    // A form with no method defaults to GET, which writes every field -- including
    // the admin password -- into the address bar whenever JS fails to preventDefault.
    const bare = [...source.matchAll(/<form id="(\w+)"(?![^>]*method=)/g)].map((m) => m[1]);
    assert.deepEqual(bare, [], `these forms would leak fields into the URL: ${bare.join(", ")}`);
  });
});
