const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const root = path.join(__dirname, "..");

function waitForServer(url, tries = 40) {
  return new Promise((resolve, reject) => {
    const tick = (left) => {
      http.get(url, (res) => {
        res.resume();
        resolve();
      }).on("error", () => {
        if (left <= 0) reject(new Error(`Server did not start: ${url}`));
        else setTimeout(() => tick(left - 1), 150);
      });
    };
    tick(tries);
  });
}

function request(url, { method = "GET", body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(url, {
      method,
      headers: payload
        ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
        : undefined
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data = {};
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe("new handle picker", () => {
  it("login for a new email returns four handles", async () => {
    const port = 3500 + (process.pid % 300);
    const origin = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: { ...process.env, PORT: String(port) },
      stdio: "pipe"
    });
    try {
      await waitForServer(`${origin}/`);
      const options = await request(`${origin}/api/handle-options?source=list`);
      assert.equal(options.status, 200);
      assert.equal(options.data.handles.length, 4);
      assert.equal(new Set(options.data.handles).size, 4);

      const email = `handle-picker-${Date.now()}@example.com`;
      const first = await request(`${origin}/api/login`, {
        method: "POST",
        body: { email, handleSource: "list" }
      });
      assert.equal(first.status, 200);
      assert.equal(first.data.needsHandle, true);
      assert.equal(first.data.handles.length, 4);
      assert.equal(new Set(first.data.handles).size, 4);
      assert.equal(first.data.user, undefined);

      const rolled = await request(`${origin}/api/handle-options?source=list`);
      assert.equal(rolled.data.handles.length, 4);

      const header = fs.readFileSync(path.join(root, "header.js"), "utf8");
      assert.match(header, /id="handleChoices"/);
      assert.match(header, /name="handleSource"/);
      assert.match(header, /value="list"/);
      assert.match(header, /value="datamuse"/);
      assert.match(header, /role="radiogroup"/);
      assert.match(header, /id="rollHandles"/);
      assert.match(header, /id="loginDiscord"/);
      assert.match(header, /id="rerollHandleModal"/);
      assert.match(header, /id="rerollHandle"/);
      assert.match(header, /id="rerollOldHandle"/);

      const claimed = await request(`${origin}/api/login`, {
        method: "POST",
        body: { email, handle: first.data.handles[0], discord: "MerryAnchor" }
      });
      assert.equal(claimed.status, 200);
      assert.equal(claimed.data.user.handle, first.data.handles[0]);
      assert.equal(claimed.data.user.discord, "MerryAnchor");

      const rerolled = await request(`${origin}/api/handle-options?source=list&email=${encodeURIComponent(email)}`);
      assert.equal(rerolled.status, 200);
      const nextHandle = rerolled.data.handles.find((handle) => handle !== claimed.data.user.handle);
      assert.ok(nextHandle);
      const switched = await request(`${origin}/api/signup`, {
        method: "POST",
        body: { email, handle: nextHandle }
      });
      assert.equal(switched.status, 200);
      assert.equal(switched.data.user.handle, nextHandle);
      assert.notEqual(switched.data.user.handle, first.data.handles[0]);
    } finally {
      child.kill();
    }
  });
});
