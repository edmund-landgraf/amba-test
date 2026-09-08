const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");

function chromePath() {
  return [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ].find((candidate) => candidate && fs.existsSync(candidate));
}

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

describe("admin menu click", () => {
  it("opens #adminModal when +a is clicked", async () => {
    let puppeteer;
    try {
      puppeteer = require("puppeteer-core");
    } catch {
      assert.fail("puppeteer-core is required to click the admin menu");
    }
    const executablePath = chromePath();
    assert.ok(executablePath, "Chrome or Edge is required to click the admin menu");

    // Always spawn a dedicated server. Reusing whatever is on :3000 lets a stale
    // process (missing newer routes or mime types) pass a test the real page fails.
    const port = 3200 + (process.pid % 300);
    const url = `http://127.0.0.1:${port}/`;
    const child = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: { ...process.env, PORT: String(port) },
      stdio: "pipe"
    });
    await waitForServer(url);

    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--disable-gpu", "--no-sandbox"]
    });
    try {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("console", (message) => {
        const text = message.text();
        if (message.type() === "error" && /module script|MIME type/i.test(text)) {
          pageErrors.push(text);
        }
      });
      await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
      assert.deepEqual(pageErrors, [], "page failed to load its scripts");
      assert.equal(
        await page.evaluate(() => typeof window.askAmbaConfirm === "function"),
        true,
        "site.js module never executed"
      );
      await page.waitForSelector("#openAdmin", { timeout: 10000 });
      await page.waitForSelector("#adminModal", { timeout: 10000 });
      await page.$eval("#openAdmin", (button) => button.click());
      const admin = await page.$eval("#adminModal", (dialog) => ({
        open: dialog.open,
        display: getComputedStyle(dialog).display,
        topLayer: dialog.matches(":modal")
      }));
      assert.equal(admin.open, true, pageErrors.join("\n") || "admin dialog did not open");
      assert.notEqual(admin.display, "none", `admin dialog is still display:${admin.display}`);
      assert.equal(admin.topLayer, true, "admin dialog is not in the modal top layer (showModal)");

      await page.$eval("#adminModal", (dialog) => { if (dialog.open) dialog.close(); });
      await page.$eval("#joinTest", (button) => button.click());
      const login = await page.$eval("#loginModal", (dialog) => ({
        open: dialog.open,
        display: getComputedStyle(dialog).display,
        topLayer: dialog.matches(":modal")
      }));
      assert.equal(login.open, true, pageErrors.join("\n") || "Join in did not open login");
      assert.notEqual(login.display, "none");
      assert.equal(login.topLayer, true, "login dialog is not in the modal top layer");

      await page.$eval("#loginModal", (dialog) => { if (dialog.open) dialog.close(); });
      await page.$eval("#accountButton", (button) => button.click());
      const menuHidden = await page.$eval("#settingsMenu", (menu) => menu.hidden);
      assert.equal(menuHidden, false, "account menu did not open");
    } finally {
      await browser.close();
      if (child) child.kill();
    }
  });
});
