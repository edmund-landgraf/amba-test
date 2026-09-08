const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");

function servedExtensions() {
  const source = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const block = source.match(/const mime = \{([\s\S]*?)\};/);
  assert.ok(block, "server.js should declare a mime map");
  return new Set([...block[1].matchAll(/"(\.[a-z0-9]+)":/g)].map((m) => m[1]));
}

describe("static mime map", () => {
  it("covers every extension the browser loads as a module", () => {
    const extensions = servedExtensions();
    for (const ext of [".js", ".mjs", ".css", ".html"]) {
      assert.ok(extensions.has(ext), `${ext} must have a mime type or the browser rejects it`);
    }
  });

  it("covers every file site.js imports over http", () => {
    const extensions = servedExtensions();
    const source = fs.readFileSync(path.join(root, "site.js"), "utf8");
    const specifiers = [...source.matchAll(/from\s+"(\.[^"]+)"/g)].map((m) => m[1]);
    assert.ok(specifiers.length > 0, "site.js should import at least one module");
    for (const specifier of specifiers) {
      const ext = path.extname(specifier);
      assert.ok(extensions.has(ext), `site.js imports ${specifier} but ${ext} has no mime type`);
      assert.ok(
        fs.existsSync(path.join(root, specifier)),
        `site.js imports ${specifier} but that file does not exist`
      );
    }
  });
});
