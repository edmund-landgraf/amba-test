const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const sessionsPath = path.join(dataDir, "sessions.json");
const signupsPath = path.join(dataDir, "signups.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const sessions = readJson(sessionsPath);
const signups = readJson(signupsPath);

const removed = sessions.reduce((count, session) => count + (session.times || []).length, 0);

for (const session of sessions) {
  session.times = [];
}

for (const signup of signups) {
  signup.votes = {};
}

writeJson(sessionsPath, sessions);
writeJson(signupsPath, signups);

console.log(`Cleared ${removed} scheduled row(s) and all signup votes.`);
