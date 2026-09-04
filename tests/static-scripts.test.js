const { execFileSync } = require("node:child_process");
const { test } = require("node:test");

const scripts = [
  "admin.js",
  "header.js",
  "layout.js",
  "markdown-toolbar.js",
  "questionnaire.js",
  "site.js",
  "theme.js",
  "timezones.js"
];

test("directly served browser scripts parse", () => {
  for (const script of scripts) {
    execFileSync(process.execPath, ["--check", script], { stdio: "pipe" });
  }
});
