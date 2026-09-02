const fs = require("fs");
const path = require("path");

const runtimeDir = path.join(__dirname, "..", "data", "runtime");
const adventuresDir = path.join(runtimeDir, "adventures");
const siteFile = path.join(runtimeDir, "site.json");

function defaultId() {
  try {
    return JSON.parse(fs.readFileSync(siteFile, "utf8")).defaultSessionId;
  } catch {
    return "amba-workflow-test-1";
  }
}

const adventurePath = path.join(adventuresDir, `${defaultId()}.json`);
if (!fs.existsSync(adventurePath)) {
  console.error("No provisioned adventure file found.");
  process.exit(1);
}

const adventure = JSON.parse(fs.readFileSync(adventurePath, "utf8"));
const removed = (adventure.times || []).reduce((count) => count + 1, 0);
adventure.times = [];
for (const signup of adventure.signups || []) {
  signup.votes = {};
}
fs.writeFileSync(adventurePath, `${JSON.stringify(adventure, null, 2)}\n`);
console.log(`Cleared ${removed} scheduled row(s) and all signup votes in ${path.basename(adventurePath)}.`);
