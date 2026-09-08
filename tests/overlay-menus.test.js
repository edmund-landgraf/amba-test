const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function cssDeclarations(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  for (const match of stripped.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    const selectors = match[1].replace(/@media[^{]+$/i, "").trim();
    const body = match[2];
    rules.push({ selectors, body });
  }
  return rules;
}

describe("overlay menus", () => {
  it("does not force display:flex on a closed admin dialog", () => {
    const bad = [];
    for (const rule of cssDeclarations(read("styles.css"))) {
      if (!/display\s*:\s*flex/i.test(rule.body)) continue;
      for (const selector of rule.selectors.split(",").map((part) => part.trim())) {
        if (!selector.includes("dialog") || !selector.includes("admin-shell")) continue;
        if (selector.includes(":not([open])")) continue;
        if (!selector.includes("[open]")) bad.push(selector);
      }
    }
    assert.deepEqual(bad, [], "closed dialog.modal.admin-shell must not use display:flex (it covers Join in, header, and +a)");
  });

  it("does not use display:none !important on closed dialogs (that blocks showModal)", () => {
    const css = read("styles.css");
    assert.doesNotMatch(css, /dialog:not\(\[open\]\)\s*\{[^}]*display:\s*none\s*!important/);
    assert.match(css, /dialog\.modal\.admin-shell\[open\]\s*\{[^}]*display:\s*flex\s*!important/);
    assert.match(css, /dialog\[open\][\s\S]*?display:\s*block\s*!important/);
  });

  it("wires Join in, account menu, and admin +a to openers", () => {
    const site = read("site.js");
    const header = read("header.js");
    assert.match(header, /id="openAdmin"/);
    assert.match(header, /id="adminModal"/);
    assert.match(header, /#joinTest/);
    assert.match(header, /#accountButton[\s\S]*settingsMenu/);
    assert.match(site, /amba-join-in/);
    assert.match(site, /amba-open-admin/);
    assert.match(site, /adminModal\.showModal/);
    assert.match(site, /function resetAdminModal\([\s\S]*querySelector\("#adminModal"\)/);
    assert.match(site, /function toggleSettingsMenu\(/);
    assert.match(site, /function placeSettingsMenu\(/);
  });
});
