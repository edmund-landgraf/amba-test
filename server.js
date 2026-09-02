const http = require("node:http");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

loadEnv();

const root = __dirname;
const dataDir = path.join(root, "data");
const runtimeDir = path.join(dataDir, "runtime");
const adventuresDir = path.join(runtimeDir, "adventures");
const siteFile = path.join(runtimeDir, "site.json");
const port = Number(process.env.PORT || 3000);
const adminPassword = String(process.env.ADMIN_PASSWORD || "").trim();
const adminTokens = new Set();
const FALLBACK_ADVENTURE_ID = "amba-workflow-test-1";
const discordGuildId = "1534196054944121074";

const jsonFiles = {
  users: path.join(runtimeDir, "users.json"),
  feedback: path.join(runtimeDir, "feedback.json")
};

const jsonDefaults = {
  users: [],
  feedback: []
};

const defaultPromote = {
  templates: {
    reddit: {
      title: "[Online] [PF2e] looking for {{players}} players — {{adventureTitle}}",
      body: "We're looking for players for **{{adventureTitle}}** ({{scope}}, {{playFormat}} Pathfinder 2e). Sheets in Wanderer's Guide, map in Owlbear, prep in AMBA, voice on Discord.\n\n**{{hookTitle}}**\n{{hook}}\n\n{{when}}\n\nSign up on the test site (email login, no AMBA account):\n{{signupUrl}}\n\nDiscord: {{discordInvite}}"
    },
    discord: {
      body: "Looking for players for **{{adventureTitle}}** — {{hookTitle}}.\n{{hookShort}}\n\nSign up on the test site (join list, not an AMBA login):\n{{signupUrl}}\n\n{{when}}"
    },
    facebook: {
      body: "Looking for a few players for {{adventureTitle}} ({{playFormat}} Pathfinder 2e, {{scope}}). {{hookTitle}}: {{hook}}\n\nSign up on our test site (not AMBA itself): {{signupUrl}}\n\n{{when}}"
    }
  },
  settings: {
    redditSubreddit: "lfg",
    discordWebhookUrl: ""
  },
  posts: []
};

function emptyAdventure(id) {
  return {
    id,
    title: "An AMBA Adventure",
    targetPlayers: 4,
    format: "Remote",
    scope: "Short adventure",
    times: [],
    syndicationUrl: "",
    playerHookUrl: "",
    playerHookText: "",
    ambaModuleId: id,
    adminPasswordHash: null,
    signups: [],
    wgSheets: [],
    promote: structuredClone(defaultPromote)
  };
}

function safeAdventureId(id) {
  const safe = String(id || "").replace(/[^A-Za-z0-9._-]/g, "_");
  return safe || FALLBACK_ADVENTURE_ID;
}

function adventureFile(id) {
  return path.join(adventuresDir, `${safeAdventureId(id)}.json`);
}

function readLegacyJson(name) {
  const runtime = path.join(runtimeDir, `${name}.json`);
  const legacy = path.join(dataDir, `${name}.json`);
  const file = fsSync.existsSync(runtime) ? runtime : legacy;
  if (!fsSync.existsSync(file)) return null;
  try {
    return JSON.parse(fsSync.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeRuntimeFile(filePath, value) {
  fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
  fsSync.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function ensureDataStore() {
  fsSync.mkdirSync(runtimeDir, { recursive: true });
  fsSync.mkdirSync(adventuresDir, { recursive: true });
  for (const name of Object.keys(jsonFiles)) {
    const dest = jsonFiles[name];
    if (fsSync.existsSync(dest)) continue;
    const legacy = path.join(dataDir, `${name}.json`);
    if (fsSync.existsSync(legacy)) {
      fsSync.copyFileSync(legacy, dest);
    } else {
      fsSync.writeFileSync(dest, `${JSON.stringify(jsonDefaults[name], null, 2)}\n`);
    }
  }

  const sessions = readLegacyJson("sessions");
  const list = Array.isArray(sessions) ? sessions : [];
  const defaultId = list[0]?.id || FALLBACK_ADVENTURE_ID;
  if (!fsSync.existsSync(siteFile)) {
    writeRuntimeFile(siteFile, { defaultSessionId: defaultId });
  }

  const existingAdventures = fsSync.readdirSync(adventuresDir).filter((name) => name.endsWith(".json"));
  if (!existingAdventures.length) {
    const signups = readLegacyJson("signups") || [];
    const promote = readLegacyJson("promote");
    const users = readLegacyJson("users") || [];
    const sheets = users
      .filter((user) => Array.isArray(user.wgSheets) && user.wgSheets.length)
      .map((user) => ({ email: user.email, sheets: user.wgSheets }));
    const toWrite = list.length ? list : [{ id: defaultId }];
    for (const session of toWrite) {
      const adventure = emptyAdventure(session.id || defaultId);
      adventure.title = session.title || adventure.title;
      adventure.targetPlayers = session.targetPlayers || adventure.targetPlayers;
      adventure.format = session.format || adventure.format;
      adventure.scope = session.scope || adventure.scope;
      adventure.times = Array.isArray(session.times) ? session.times : [];
      adventure.syndicationUrl = session.syndicationUrl || "";
      adventure.playerHookUrl = session.playerHookUrl || "";
      adventure.playerHookText = session.playerHookText || "";
      if (adventure.id === defaultId) {
        adventure.signups = Array.isArray(signups) ? signups : [];
        adventure.wgSheets = sheets;
        if (promote) adventure.promote = promote;
      }
      writeRuntimeFile(adventureFile(adventure.id), adventure);
    }
  }

  const usersPath = jsonFiles.users;
  if (fsSync.existsSync(usersPath)) {
    const users = JSON.parse(fsSync.readFileSync(usersPath, "utf8"));
    if (Array.isArray(users) && users.some((user) => "wgSheets" in user)) {
      writeRuntimeFile(usersPath, users.map(({ wgSheets, ...user }) => user));
    }
  }
}

ensureDataStore();

const discordInviteUrl = `https://discord.com/channels/${discordGuildId}/`;

const JSON_BODY_MAX = 1024 * 1024;
const WG_EXPORT_MAX_TOTAL = 50 * 1024 * 1024;
const WG_EXPORT_DIR = path.join(dataDir, "wg-exports");
const WG_EXPORT_INDEX = path.join(dataDir, "wg-exports-index.json");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".zip": "application/zip"
};

const adjectives = [
  "Brisk", "Copper", "Clever", "Dusky", "Gentle", "Hidden", "Lucky", "Merry",
  "Nimble", "Quiet", "Rapid", "Silver", "Slippery", "Sturdy", "Velvet", "Witty"
];

const nouns = [
  "Anchor", "Banner", "Beacon", "Beetle", "Candle", "Comet", "Compass", "Ember",
  "Lantern", "Maple", "Orbit", "Pebble", "Quill", "Riddle", "Signal", "Thimble"
];

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    const code = error.message;
    if (code === "payload_too_large" || code === "quota") {
      sendJson(res, 413, { error: code, detail: "File upload space is full." });
      return;
    }
    if (code === "login_required") {
      sendJson(res, 401, { error: code });
      return;
    }
    if (code === "forbidden") {
      sendJson(res, 403, { error: code });
      return;
    }
    if (code === "not_found") {
      sendJson(res, 404, { error: code });
      return;
    }
    if (code === "bad_filename" || code === "invalid_json" || code === "bad_sheet_url" || code === "sheet_limit" || code === "not_public") {
      sendJson(res, 400, { error: code });
      return;
    }
    sendJson(res, 500, { error: "server_error", detail: error.message });
  }
});

server.listen(port, () => {
  console.log(`AMBA test site listening on http://localhost:${port}`);
});

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/discord-widget") {
    sendJson(res, 200, await discordWidgetStatus());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    const email = normalizeEmail(url.searchParams.get("email"));
    const state = await getState(email);
    sendJson(res, 200, state);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/player-hook") {
    const { playerHookUrl } = await sessionLinks();
    const html = await playerHookPreviewHtml(playerHookUrl);
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=120"
    });
    res.end(html);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/wg-exports") {
    const email = normalizeEmail(url.searchParams.get("email"));
    if (!await findUserByEmail(email)) {
      sendJson(res, 401, { error: "login_required" });
      return;
    }
    sendJson(res, 200, await listWgExports(email));
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/wg-exports/file") {
    const result = await deleteWgExport({
      email: url.searchParams.get("email"),
      name: url.searchParams.get("name")
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/wg-exports/file") {
    const email = normalizeEmail(url.searchParams.get("email"));
    if (!await findUserByEmail(email)) {
      sendJson(res, 401, { error: "login_required" });
      return;
    }
    const name = safeExportName(url.searchParams.get("name"));
    if (!name) {
      sendJson(res, 400, { error: "bad_filename" });
      return;
    }
    const filePath = path.join(WG_EXPORT_DIR, name);
    try {
      const file = await fs.readFile(filePath);
      res.writeHead(200, {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${name}"`
      });
      res.end(file);
    } catch {
      sendJson(res, 404, { error: "not_found" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/wg-exports") {
    const body = await readBody(req, WG_EXPORT_MAX_TOTAL + 64 * 1024);
    const result = await saveWgExport(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/wg-sheets") {
    const body = await readBody(req);
    const result = await saveWgSheet(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/wg-sheets") {
    const result = await deleteWgSheet({
      email: url.searchParams.get("email"),
      url: url.searchParams.get("url")
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/signup") {
    const body = await readBody(req);
    const user = await upsertUser(body);
    sendJson(res, 200, { user: publicUser(user, await liveAdventure()) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const user = await upsertUser({ email: body.email });
    sendJson(res, 200, { user: publicUser(user, await liveAdventure()) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/delete-account") {
    const body = await readBody(req);
    await deleteAccount(body.email);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/session") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const session = await saveSession(body);
    sendJson(res, 200, { session });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/times") {
    const body = await readBody(req);
    const time = await addTime(body);
    sendJson(res, 200, { time });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/times/update") {
    const body = await readBody(req);
    const time = await updateTime(body);
    sendJson(res, 200, { time });
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/api/times") {
    const body = await readBody(req);
    const time = await updateTime(body);
    sendJson(res, 200, { time });
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/times") {
    const body = await readBody(req);
    const result = await deleteTime(body);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/slot") {
    const body = await readBody(req);
    const signup = await saveSlot(body);
    sendJson(res, 200, { signup: publicSignup(signup) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/availability") {
    const body = await readBody(req);
    const signup = await saveAvailability(body);
    sendJson(res, 200, { signup: publicSignup(signup) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/feedback") {
    const body = await readBody(req);
    const item = await saveFeedback(body);
    sendJson(res, 200, { feedback: publicFeedback(item) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await readBody(req);
    if (!adminPassword || !passwordsMatch(String(body.password || "").trim(), adminPassword)) {
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }
    const token = crypto.randomUUID();
    adminTokens.add(token);
    sendJson(res, 200, { token });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/yes-emails") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, await adminYesMail());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/amba-modules") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, await listAmbaModules());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/promote") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, await publicPromote(req));
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/admin/promote/templates") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    sendJson(res, 200, await savePromoteTemplates(body, req));
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/admin/promote/settings") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    sendJson(res, 200, await savePromoteSettings(body, req));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/promote/post") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    sendJson(res, 200, await createPromotePost(body, req));
    return;
  }

  const permalinkMatch = url.pathname.match(/^\/api\/admin\/promote\/posts\/([^/]+)\/permalink$/);
  if (req.method === "POST" && permalinkMatch) {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    sendJson(res, 200, await setPromotePermalink(permalinkMatch[1], body, req));
    return;
  }

  const postMatch = url.pathname.match(/^\/api\/admin\/promote\/posts\/([^/]+)$/);
  if (req.method === "PATCH" && postMatch) {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    sendJson(res, 200, await patchPromotePost(postMatch[1], body, req));
    return;
  }

  if (req.method === "DELETE" && postMatch) {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, await deletePromotePost(postMatch[1], url.searchParams.get("forget") === "1", req));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/delete-email") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    if (!email) {
      sendJson(res, 400, { error: "email_required" });
      return;
    }
    await deleteAccount(email);
    sendJson(res, 200, { ok: true, ...(await adminYesMail()) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/export/signups.csv") {
    const signups = (await liveAdventure()).signups || [];
    const csv = toCsv(signups.map(publicSignup), [
      "handle", "discord", "timezone", "role", "characterStatus", "availability", "suggestedTime", "notes", "createdAt"
    ]);
    res.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=\"amba-test-signups.csv\""
    });
    res.end(csv);
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(root, requested));

  if (!filePath.startsWith(root) || filePath.includes(`${path.sep}data${path.sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": mime[path.extname(filePath)] || "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

async function discordWidgetStatus() {
  try {
    const response = await fetch(`https://discord.com/api/guilds/${discordGuildId}/widget.json`);
    if (response.ok) return { enabled: true };
    return { enabled: false };
  } catch {
    return { enabled: false };
  }
}

async function getState(email) {
  const adventure = await liveAdventure();
  const signups = adventure.signups || [];
  const feedback = await readJson("feedback");
  const users = await readJson("users");
  const user = email ? await findUserByEmail(email) : null;
  const times = (adventure.times || []).map((time) => {
    const { createdBy, ...publicTime } = time;
    return {
      ...publicTime,
      createdByMe: Boolean(user && createdBy && createdBy === user.email),
      participants: signups
        .filter((signup) => signup.votes?.[time.id])
        .map((signup) => ({
          handle: signup.handle,
          status: signup.votes[time.id] === "in" ? "" : signup.votes[time.id],
          mine: Boolean(user && signup.email === user.email)
        }))
    };
  });

  return {
    session: { ...publicSession(adventure), times },
    user: user ? publicUser(user, adventure) : null,
    signups: signups.map(publicSignup),
    feedback: feedback.map(publicFeedback),
    pcs: publicPcs(adventure, users)
  };
}

async function upsertUser(data) {
  const email = normalizeEmail(data.email);
  if (!email) throw new Error("Email is required.");

  const users = await readJson("users");
  const existing = users.find((user) => user.email === email);
  const handle = normalizeHandle(data.handle) || existing?.handle || createHandle(users);

  if (existing) {
    existing.handle = handle;
    existing.discord = String(data.discord || existing.discord || "").trim();
    existing.timezone = String(data.timezone || existing.timezone || "").trim();
    existing.characterStatus = String(data.characterStatus || existing.characterStatus || "").trim();
    existing.role = "admin";
    existing.updatedAt = new Date().toISOString();
    await writeJson("users", users);
    if (data.characterStatus !== undefined) {
      await upsertAdventureSignup(existing, { characterStatus: existing.characterStatus });
    }
    return existing;
  }

  const user = {
    id: crypto.randomUUID(),
    email,
    handle,
    discord: String(data.discord || "").trim(),
    timezone: String(data.timezone || "").trim(),
    characterStatus: String(data.characterStatus || "").trim(),
    role: "admin",
    createdAt: new Date().toISOString()
  };
  users.push(user);
  await writeJson("users", users);
  if (data.characterStatus !== undefined) {
    await upsertAdventureSignup(user, { characterStatus: user.characterStatus });
  }
  return user;
}

async function findUserByEmail(email) {
  const users = await readJson("users");
  return users.find((user) => user.email === normalizeEmail(email));
}

async function deleteAccount(email) {
  const normalized = normalizeEmail(email);
  const users = await readJson("users");
  const user = users.find((item) => item.email === normalized);
  if (!user) return;

  await writeJson("users", users.filter((item) => item.email !== normalized));
  await writeJson("feedback", (await readJson("feedback")).filter((item) => item.email !== normalized));
  const names = await fs.readdir(adventuresDir);
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const adventure = JSON.parse(await fs.readFile(path.join(adventuresDir, name), "utf8"));
    adventure.signups = (adventure.signups || []).filter((item) => item.email !== normalized);
    adventure.wgSheets = (adventure.wgSheets || []).filter((item) => item.email !== normalized);
    await writeAdventure(adventure);
  }
}

function sanitizeHttpUrl(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";
  if (/[…]/.test(raw) || /\s/.test(raw)) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

async function playerHookPreviewHtml(hookUrl) {
  const url = sanitizeHttpUrl(hookUrl);
  if (!url) {
    return hookPreviewDocument("<p>No player hook URL is saved yet.</p>");
  }
  try {
    const page = await fetchPageHtml(url);
    const styles = extractInnerByTag(page, "style", (chunk) => chunk.includes("embedded-document-root") || chunk.includes("lore-box"));
    const body = extractElementByClass(page, "embedded-document-root")
      || extractElementByClass(page, "synd-content")
      || "<p>Could not find the handout HTML on that page.</p>";
    return hookPreviewDocument(rewriteHookUrls(body, url), styles);
  } catch (error) {
    return hookPreviewDocument(`<p>Could not load the player hook (${error.message}).</p>`);
  }
}

function hookPreviewDocument(body, styles = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html, body { margin: 0; background: #fff; color: #1a1612; }
    body { font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
    .preview-root { padding: 4px 8px 12px; }
  </style>
  ${styles}
</head>
<body class="preview-root">${body}</body>
</html>`;
}

function extractInnerByTag(html, tag, matchFn) {
  const open = new RegExp(`<${tag}[^>]*>`, "ig");
  let found = "";
  let hit;
  while ((hit = open.exec(html))) {
    const end = html.toLowerCase().indexOf(`</${tag}>`, hit.index + hit[0].length);
    if (end < 0) continue;
    const inner = html.slice(hit.index, end + tag.length + 3);
    if (!matchFn || matchFn(inner)) found += inner;
  }
  return found;
}

function extractElementByClass(html, className) {
  const attr = html.search(new RegExp(`class=["'][^"']*\\b${className}\\b[^"']*["']`, "i"));
  if (attr < 0) return "";
  const start = html.lastIndexOf("<", attr);
  const tagMatch = html.slice(start).match(/^<([a-z][a-z0-9]*)/i);
  if (!tagMatch) return "";
  const tag = tagMatch[1];
  return sliceBalancedTag(html, start, tag);
}

function sliceBalancedTag(html, start, tag) {
  const lower = html.toLowerCase();
  const openRe = new RegExp(`<${tag}\\b`, "ig");
  const closeToken = `</${tag}>`;
  openRe.lastIndex = start;
  const first = openRe.exec(html);
  if (!first) return "";
  let depth = 1;
  let i = first.index + first[0].length;
  while (i < html.length && depth > 0) {
    const nextOpen = lower.indexOf(`<${tag}`, i);
    const nextClose = lower.indexOf(closeToken, i);
    if (nextClose < 0) return html.slice(start);
    const openIsNext = nextOpen >= 0 && nextOpen < nextClose && html[nextOpen + 1] !== "/";
    if (openIsNext) {
      depth += 1;
      i = nextOpen + tag.length + 1;
    } else {
      depth -= 1;
      i = nextClose + closeToken.length;
    }
  }
  return html.slice(start, i);
}

function rewriteHookUrls(html, baseUrl) {
  return html.replace(/\s(href|src)=["']([^"']+)["']/gi, (full, attr, value) => {
    if (!value || value.startsWith("#") || value.startsWith("data:") || value.startsWith("mailto:") || value.startsWith("javascript:")) {
      return full;
    }
    try {
      return ` ${attr}="${new URL(value, baseUrl).toString()}"`;
    } catch {
      return full;
    }
  });
}

function syndicationFromHook(hookUrl) {
  try {
    const parsed = new URL(hookUrl);
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/p\/[0-9a-f-]{36}\/?$/i, "");
    return parsed.toString();
  } catch {
    return "";
  }
}

async function fetchPageHtml(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { accept: "text/html", "user-agent": "amba-test-hook-preview" },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Could not load page (${response.status})`);
  return response.text();
}

function htmlToPlain(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function stripSyndicationChrome(text) {
  return String(text || "")
    .replace(/\n?Click here to add a comment[\s\S]*$/i, "")
    .replace(/\n?Read-only syndicated snapshot[\s\S]*$/i, "")
    .replace(/\n?Made with Amba[\s\S]*$/i, "")
    .trim();
}

function moduleTitleFromSyndication(html) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let raw = htmlToPlain(title ? title[1] : "");
  raw = raw.replace(/\s*[·|].*$/, "").replace(/\s*[–—].*$/, "");
  if (!raw) {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    raw = htmlToPlain(h1 ? h1[1] : "");
  }
  return raw.replace(/\s*\([^)]*\)\s*$/g, "").replace(/\s+/g, " ").trim();
}

async function refreshSessionFromLinks(session) {
  const syndicationUrl = sanitizeHttpUrl(session.syndicationUrl);
  const playerHookUrl = sanitizeHttpUrl(session.playerHookUrl);
  if (syndicationUrl) {
    try {
      const title = moduleTitleFromSyndication(await fetchPageHtml(syndicationUrl));
      if (title) session.title = title;
    } catch {
      // Keep the last saved title if the syndication page cannot be read.
    }
  }
  if (playerHookUrl) {
    try {
      const page = await fetchPageHtml(playerHookUrl);
      const body = extractElementByClass(page, "embedded-document-root")
        || extractElementByClass(page, "synd-content")
        || page;
      session.playerHookText = stripSyndicationChrome(htmlToPlain(body));
    } catch {
      // Keep the last saved hook text if the player page cannot be read.
    }
  } else {
    session.playerHookText = "";
  }
  return session;
}

async function sessionLinks() {
  const session = await liveAdventure();
  return {
    title: session.title || "",
    syndicationUrl: session.syndicationUrl || "",
    playerHookUrl: session.playerHookUrl || ""
  };
}

async function saveSession(data) {
  const session = await liveAdventure();
  const playerHookUrl = sanitizeHttpUrl(data.playerHookUrl);
  const syndicationUrl = sanitizeHttpUrl(data.syndicationUrl) || syndicationFromHook(playerHookUrl);
  session.syndicationUrl = syndicationUrl;
  session.playerHookUrl = playerHookUrl;
  await refreshSessionFromLinks(session);
  session.updatedAt = new Date().toISOString();
  await writeAdventure(session);
  return sessionLinks();
}

async function addTime(data) {
  const session = await liveAdventure();
  if (!Array.isArray(session.times)) session.times = [];
  const date = String(data.date || "").trim();
  const clock = String(data.time || "").trim();
  const lengthMinutes = Number(data.lengthMinutes || data.length || 0);
  const timezone = String(data.timezone || "Pacific").trim() || "Pacific";
  const title = String(data.title || "").trim() || [date, clock, timezone, lengthMinutes ? `${lengthMinutes} min` : ""].filter(Boolean).join(" ");
  if (!title) throw new Error("Date, time, and session length are required.");

  const time = {
    id: crypto.randomUUID(),
    title,
    date,
    time: clock,
    timezone,
    lengthMinutes: lengthMinutes || null,
    note: String(data.note || "").trim(),
    createdBy: normalizeEmail(data.email),
    createdAt: new Date().toISOString()
  };

  session.times.push(time);
  await writeAdventure(session);
  return time;
}

async function updateTime(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("login_required");

  const timeId = String(data.timeId || "").trim();
  if (!timeId) throw new Error("Time is required.");

  const session = await liveAdventure();
  const time = (session.times || []).find((item) => item.id === timeId);
  if (!time) throw new Error("not_found");
  if (!time.createdBy || time.createdBy !== user.email) throw new Error("forbidden");

  const date = String(data.date || "").trim();
  const clock = String(data.time || "").trim();
  const lengthMinutes = Number(data.lengthMinutes || data.length || 0);
  if (!date || !clock || !lengthMinutes) throw new Error("Date, time, and session length are required.");

  time.date = date;
  time.time = clock;
  time.lengthMinutes = lengthMinutes;
  time.title = [date, clock, time.timezone, `${lengthMinutes} min`].filter(Boolean).join(" ");
  time.updatedAt = new Date().toISOString();

  await writeAdventure(session);
  return time;
}

async function deleteTime(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("login_required");

  const timeId = String(data.timeId || "").trim();
  if (!timeId) throw new Error("Time is required.");

  const session = await liveAdventure();
  const time = (session.times || []).find((item) => item.id === timeId);
  if (!time) throw new Error("not_found");
  if (!time.createdBy || time.createdBy !== user.email) throw new Error("forbidden");

  session.times = session.times.filter((item) => item.id !== timeId);
  for (const signup of session.signups || []) {
    if (signup.votes?.[timeId]) delete signup.votes[timeId];
  }
  await writeAdventure(session);
  return { ok: true };
}

async function upsertAdventureSignup(user, extra = {}) {
  const adventure = await liveAdventure();
  if (!Array.isArray(adventure.signups)) adventure.signups = [];
  const existing = adventure.signups.find((item) => item.email === user.email);
  const record = existing || {
    id: crypto.randomUUID(),
    email: user.email,
    createdAt: new Date().toISOString()
  };
  record.handle = user.handle;
  record.discord = user.discord;
  record.timezone = user.timezone;
  record.role = user.role;
  record.characterStatus = extra.characterStatus !== undefined
    ? extra.characterStatus
    : (record.characterStatus || user.characterStatus || "");
  record.votes = { ...(record.votes || {}), ...(extra.votes || {}) };
  if (extra.suggestedTime !== undefined) record.suggestedTime = extra.suggestedTime;
  if (extra.notes !== undefined) record.notes = extra.notes;
  record.updatedAt = new Date().toISOString();
  if (extra.status === "leave" && extra.timeId) {
    delete record.votes[extra.timeId];
  } else if (extra.timeId && extra.status === "in") {
    record.votes[extra.timeId] = record.votes[extra.timeId] || "in";
  } else if (extra.timeId && extra.status) {
    record.votes[extra.timeId] = extra.status;
  }
  if (!existing) adventure.signups.push(record);
  await writeAdventure(adventure);
  return record;
}

async function saveSlot(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("User is required.");
  const timeId = String(data.timeId || "").trim();
  if (!timeId) throw new Error("Time is required.");
  const status = data.status === "leave" || data.status === "yes" || data.status === "maybe" || data.status === "no"
    ? data.status
    : "in";
  return upsertAdventureSignup(user, { timeId, status });
}

async function saveAvailability(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("User is required.");

  if (data.suggestedTime?.title) {
    await addTime({ ...data.suggestedTime, email: user.email });
  }

  return upsertAdventureSignup(user, {
    votes: data.votes || {},
    suggestedTime: data.suggestedTime || null,
    notes: String(data.notes || "").trim()
  });
}

async function saveFeedback(data) {
  const user = await findUserByEmail(data.email);
  const item = {
    id: crypto.randomUUID(),
    email: user?.email || "",
    handle: user?.handle || normalizeHandle(data.handle) || "Anonymous",
    topic: String(data.topic || "Other").trim(),
    message: String(data.message || "").trim(),
    createdAt: new Date().toISOString()
  };

  if (!item.message) throw new Error("Feedback message is required.");
  const feedback = await readJson("feedback");
  feedback.push(item);
  await writeJson("feedback", feedback);
  return item;
}

function publicUser(user, adventure) {
  const pack = (adventure?.wgSheets || []).find((item) => item.email === user.email);
  const signup = (adventure?.signups || []).find((item) => item.email === user.email);
  return {
    email: user.email,
    handle: user.handle,
    discord: user.discord,
    timezone: user.timezone,
    characterStatus: signup?.characterStatus || user.characterStatus || "",
    wgSheets: (pack?.sheets || []).map((sheet) => publicSheet(sheet, user.handle)),
    role: user.role
  };
}

const WG_SHEET_HOSTS = new Set([
  "amba.wandersguide.site",
  "wgui.wandersguide.site",
  "wanderersguide.app",
  "www.wanderersguide.app"
]);

function publicSheet(sheet, handle) {
  return {
    url: sheet.url,
    id: sheet.id,
    name: sheet.name || "",
    abc: sheet.abc || "",
    level: sheet.level ?? "",
    imageUrl: sheet.imageUrl || "",
    handle: handle || sheet.handle || "",
    error: sheet.error || ""
  };
}

function publicPcs(adventure, users) {
  const handles = new Map(users.map((user) => [user.email, user.handle]));
  const rows = [];
  for (const pack of adventure.wgSheets || []) {
    const handle = handles.get(pack.email) || "";
    for (const sheet of pack.sheets || []) {
      rows.push(publicSheet(sheet, handle));
    }
  }
  rows.sort((a, b) => String(a.name || a.url).localeCompare(String(b.name || b.url)));
  return rows;
}

function parseWgSheetUrl(value) {
  const raw = sanitizeHttpUrl(value);
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (![...WG_SHEET_HOSTS].some((allowed) => allowed.replace(/^www\./, "") === host)) return null;
  const match = parsed.pathname.match(/^\/sheet\/(\d+)\/?$/i);
  if (!match) return null;
  const id = Number(match[1]);
  if (!Number.isInteger(id) || id < 1) return null;
  const originHost = parsed.hostname.toLowerCase();
  return {
    id,
    url: `https://${originHost}/sheet/${id}`
  };
}

function contentName(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  return String(value.name || value.label || "").trim();
}

function isPublicCharacter(row) {
  const options = row?.options || {};
  return options.is_public === true || options.public === true;
}

function summarizeCharacter(row, url) {
  const details = row?.details || {};
  const ancestry = contentName(details.ancestry);
  const heritage = contentName(details.heritage);
  const background = contentName(details.background);
  const klass = contentName(details.class);
  const ancestryLabel = [heritage, ancestry].filter(Boolean).join(" ").trim() || ancestry;
  return {
    url,
    id: row.id,
    name: String(row.name || "").trim(),
    abc: [ancestryLabel, background, klass].filter(Boolean).join(" / "),
    level: row.level ?? "",
    imageUrl: String(details.image_url || details.imageUrl || "").trim(),
    error: ""
  };
}

let wgAnonCache = { key: "", at: 0 };

async function wgAnonKey() {
  const fromEnv = String(process.env.WG_ANON_KEY || "").trim();
  if (fromEnv) return fromEnv;
  if (wgAnonCache.key && Date.now() - wgAnonCache.at < 60 * 60 * 1000) return wgAnonCache.key;
  const pages = [
    "https://amba.wandersguide.site/",
    "https://wgui.wandersguide.site/"
  ];
  for (const page of pages) {
    const key = await discoverAnonKey(page);
    if (key) {
      wgAnonCache = { key, at: Date.now() };
      return key;
    }
  }
  return "";
}

async function discoverAnonKey(pageUrl) {
  const html = await fetch(pageUrl, { signal: AbortSignal.timeout(12000) }).then((res) => res.text());
  const scripts = [...html.matchAll(/src=["'](\.?\/assets\/[^"']+\.js)["']/gi)].map((match) => new URL(match[1], pageUrl).href);
  const seen = new Set();
  const queue = [...scripts];
  while (queue.length && seen.size < 8) {
    const src = queue.shift();
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const js = await fetch(src, { signal: AbortSignal.timeout(15000) }).then((res) => res.text());
    const created = js.match(/createClient\(\s*["']https?:[^"']+["']\s*,\s*["'](eyJ[^"']+)["']/);
    if (created) return created[1];
    const anon = js.match(/anon(?:Key)?["']?\s*[:=]\s*["'](eyJ[^"']+)["']/i);
    if (anon) return anon[1];
    const jwt = js.match(/["'](eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)["']/);
    if (jwt) return jwt[1];
    if (js.length < 500000) {
      for (const match of js.matchAll(/from["'](\.\/[^"']+\.js)["']/g)) {
        queue.push(new URL(match[1], src).href);
      }
    }
  }
  return "";
}

async function fetchPublicCharacter(id) {
  const key = await wgAnonKey();
  const headers = {
    accept: "application/json",
    ...(key ? { apikey: key, authorization: `Bearer ${key}` } : {})
  };
  const bases = [
    String(process.env.WG_API_URL || "").trim().replace(/\/$/, ""),
    "https://amba.wandersguide.site",
    "https://api.wanderersguide.app"
  ].filter(Boolean);
  for (const base of [...new Set(bases)]) {
    try {
      const restUrl = `${base}/rest/v1/character?id=eq.${id}&select=id,name,level,details,options`;
      const response = await fetch(restUrl, { headers, signal: AbortSignal.timeout(12000) });
      if (!response.ok) continue;
      const rows = await response.json();
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row && row.id) return row;
    } catch {
      continue;
    }
  }
  return null;
}

async function saveWgSheet(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("login_required");
  const parsed = parseWgSheetUrl(data.url);
  if (!parsed) throw new Error("bad_sheet_url");
  const adventure = await liveAdventure();
  if (!Array.isArray(adventure.wgSheets)) adventure.wgSheets = [];
  let pack = adventure.wgSheets.find((item) => item.email === user.email);
  if (!pack) {
    pack = { email: user.email, sheets: [] };
    adventure.wgSheets.push(pack);
  }
  const replaceUrl = parseWgSheetUrl(data.replaceUrl)?.url || "";
  const sheets = (pack.sheets || []).filter((sheet) => sheet.url !== replaceUrl && sheet.url !== parsed.url);
  if (sheets.length >= 2) throw new Error("sheet_limit");
  const row = await fetchPublicCharacter(parsed.id);
  if (!row) throw new Error("not_public");
  if (!isPublicCharacter(row)) throw new Error("not_public");
  sheets.push(summarizeCharacter(row, parsed.url));
  pack.sheets = sheets;
  await writeAdventure(adventure);
  const users = await readJson("users");
  return { user: publicUser(user, adventure), pcs: publicPcs(adventure, users) };
}

async function deleteWgSheet(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("login_required");
  const parsed = parseWgSheetUrl(data.url);
  if (!parsed) throw new Error("bad_sheet_url");
  const adventure = await liveAdventure();
  const pack = (adventure.wgSheets || []).find((item) => item.email === user.email);
  if (pack) {
    pack.sheets = (pack.sheets || []).filter((sheet) => sheet.url !== parsed.url);
    await writeAdventure(adventure);
  }
  const users = await readJson("users");
  return { user: publicUser(user, adventure), pcs: publicPcs(adventure, users) };
}

function publicSignup(signup) {
  return {
    handle: signup.handle,
    discord: signup.discord,
    timezone: signup.timezone,
    role: signup.role,
    characterStatus: signup.characterStatus,
    availability: formatVotes(signup.votes || {}),
    suggestedTime: signup.suggestedTime?.title || "",
    notes: signup.notes || "",
    createdAt: signup.createdAt
  };
}

function publicFeedback(item) {
  return {
    handle: item.handle,
    topic: item.topic,
    message: item.message,
    createdAt: item.createdAt
  };
}

function requireAdmin(req, res) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!adminTokens.has(token)) {
    sendJson(res, 401, { error: "unauthorized" });
    return false;
  }
  return true;
}

function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

async function readBody(req, maxBytes = JSON_BODY_MAX) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      req.destroy();
      throw new Error("payload_too_large");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function safeJsonExportName(name) {
  const base = path.basename(String(name || "")).trim();
  if (!/^[A-Za-z0-9._-]+\.json$/i.test(base) || base.length > 120) return "";
  return base;
}

function safeZipExportName(name) {
  const base = path.basename(String(name || "")).trim();
  if (!/^[A-Za-z0-9._-]+\.zip$/i.test(base) || base.length > 120) return "";
  return base;
}

function safeExportName(name) {
  return safeZipExportName(name);
}

function zipNameForJson(jsonName) {
  const json = safeJsonExportName(jsonName);
  if (!json) return "";
  return `${json.slice(0, -5)}.zip`;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipOneFile(entryName, data) {
  const uncompressed = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  const compressed = zlib.deflateRawSync(uncompressed, { level: 9 });
  const name = Buffer.from(entryName, "utf8");
  const crc = crc32(uncompressed);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(uncompressed.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(uncompressed.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);
  const eocd = Buffer.alloc(22);
  const cdOffset = local.length + name.length + compressed.length;
  const cdSize = central.length + name.length;
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([local, name, compressed, central, name, eocd]);
}

async function fileSizeOrZero(filePath) {
  try {
    return (await fs.stat(filePath)).size;
  } catch {
    return 0;
  }
}

async function compressLeftoverJsonExports() {
  await fs.mkdir(WG_EXPORT_DIR, { recursive: true });
  const names = await fs.readdir(WG_EXPORT_DIR);
  const index = await readExportIndex();
  let changed = false;
  for (const name of names) {
    const jsonName = safeJsonExportName(name);
    if (!jsonName) continue;
    const zipName = zipNameForJson(jsonName);
    const jsonPath = path.join(WG_EXPORT_DIR, jsonName);
    const zipPath = path.join(WG_EXPORT_DIR, zipName);
    const raw = await fs.readFile(jsonPath);
    await fs.writeFile(zipPath, zipOneFile(jsonName, raw));
    await fs.unlink(jsonPath);
    if (index[jsonName]) {
      index[zipName] = index[jsonName];
      delete index[jsonName];
      changed = true;
    }
  }
  if (changed) await writeExportIndex(index);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readExportIndex() {
  try {
    return JSON.parse(await fs.readFile(WG_EXPORT_INDEX, "utf8"));
  } catch {
    return {};
  }
}

async function writeExportIndex(value) {
  await fs.writeFile(WG_EXPORT_INDEX, `${JSON.stringify(value, null, 2)}\n`);
}

async function listWgExports(viewerEmail = "") {
  await compressLeftoverJsonExports();
  await fs.mkdir(WG_EXPORT_DIR, { recursive: true });
  const index = await readExportIndex();
  const sessionId = await defaultAdventureId();
  const viewer = normalizeEmail(viewerEmail);
  const names = await fs.readdir(WG_EXPORT_DIR);
  const files = [];
  let usedBytes = 0;
  for (const name of names) {
    const safe = safeZipExportName(name);
    if (!safe) continue;
    const meta = index[safe] || {};
    const ownerSession = meta.sessionId || sessionId;
    if (ownerSession !== sessionId) continue;
    const st = await fs.stat(path.join(WG_EXPORT_DIR, name));
    usedBytes += st.size;
    files.push({
      name: safe,
      size: st.size,
      handle: meta.handle || "",
      mine: Boolean(viewer && normalizeEmail(meta.email) === viewer),
      updatedAt: meta.updatedAt || st.mtime.toISOString()
    });
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return {
    files,
    usedBytes,
    capBytes: WG_EXPORT_MAX_TOTAL,
    usedLabel: formatBytes(usedBytes),
    capLabel: "50 MB"
  };
}

async function saveWgExport(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("login_required");
  const jsonName = safeJsonExportName(data.filename);
  const zipName = zipNameForJson(jsonName);
  if (!jsonName || !zipName) throw new Error("bad_filename");
  const content = String(data.content || "");
  try {
    JSON.parse(content);
  } catch {
    throw new Error("invalid_json");
  }
  const archive = zipOneFile(jsonName, content);
  await compressLeftoverJsonExports();
  await fs.mkdir(WG_EXPORT_DIR, { recursive: true });
  const dest = path.join(WG_EXPORT_DIR, zipName);
  const previous = await fileSizeOrZero(dest);
  const listed = await listWgExports();
  if (listed.usedBytes - previous + archive.length > WG_EXPORT_MAX_TOTAL) {
    throw new Error("quota");
  }
  await fs.writeFile(dest, archive);
  const index = await readExportIndex();
  delete index[jsonName];
  index[zipName] = {
    handle: user.handle,
    email: user.email,
    sessionId: await defaultAdventureId(),
    updatedAt: new Date().toISOString()
  };
  await writeExportIndex(index);
  return listWgExports(user.email);
}

async function deleteWgExport(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("login_required");
  const zipName = safeZipExportName(data.name);
  if (!zipName) throw new Error("bad_filename");
  const index = await readExportIndex();
  const record = index[zipName];
  if (!record || normalizeEmail(record.email) !== user.email) {
    throw new Error("forbidden");
  }
  try {
    await fs.unlink(path.join(WG_EXPORT_DIR, zipName));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  delete index[zipName];
  await writeExportIndex(index);
  return listWgExports(user.email);
}

async function readJson(name) {
  try {
    return JSON.parse(await fs.readFile(jsonFiles[name], "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const fallback = jsonDefaults[name];
    await writeJson(name, fallback);
    return structuredClone(fallback);
  }
}

async function writeJson(name, value) {
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.writeFile(jsonFiles[name], `${JSON.stringify(value, null, 2)}\n`);
}

async function defaultAdventureId() {
  try {
    const site = JSON.parse(await fs.readFile(siteFile, "utf8"));
    return safeAdventureId(site.defaultSessionId || FALLBACK_ADVENTURE_ID);
  } catch {
    return FALLBACK_ADVENTURE_ID;
  }
}

async function liveAdventure() {
  const id = await defaultAdventureId();
  try {
    const data = JSON.parse(await fs.readFile(adventureFile(id), "utf8"));
    return { ...emptyAdventure(id), ...data, id };
  } catch {
    const adventure = emptyAdventure(id);
    await writeAdventure(adventure);
    return adventure;
  }
}

async function writeAdventure(adventure) {
  await fs.mkdir(adventuresDir, { recursive: true });
  await fs.writeFile(adventureFile(adventure.id), `${JSON.stringify(adventure, null, 2)}\n`);
}

function publicSession(adventure) {
  return {
    id: adventure.id,
    title: adventure.title,
    targetPlayers: adventure.targetPlayers,
    format: adventure.format,
    scope: adventure.scope,
    times: adventure.times || [],
    syndicationUrl: adventure.syndicationUrl || "",
    playerHookUrl: adventure.playerHookUrl || "",
    playerHookText: adventure.playerHookText || "",
    ambaModuleId: adventure.ambaModuleId || adventure.id
  };
}

function mergePromote(data) {
  return {
    templates: {
      reddit: {
        title: data?.templates?.reddit?.title || defaultPromote.templates.reddit.title,
        body: data?.templates?.reddit?.body || defaultPromote.templates.reddit.body
      },
      discord: {
        body: data?.templates?.discord?.body || defaultPromote.templates.discord.body
      },
      facebook: {
        body: data?.templates?.facebook?.body || defaultPromote.templates.facebook.body
      }
    },
    settings: {
      redditSubreddit: data?.settings?.redditSubreddit || "lfg",
      discordWebhookUrl: data?.settings?.discordWebhookUrl || ""
    },
    posts: Array.isArray(data?.posts) ? data.posts : []
  };
}

async function listAmbaModules() {
  const selectedId = await defaultAdventureId();
  const adventure = await liveAdventure();
  // Later: fetch AMBA list-modules and provision a new adventure JSON when admin selects one.
  return {
    locked: true,
    selectedId,
    modules: [{
      id: adventure.id,
      title: adventure.title || "An AMBA Adventure",
      source: "provision"
    }]
  };
}

// Promote env: PUBLIC_SITE_URL, DISCORD_LFG_WEBHOOK,
// REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD, REDDIT_USER_AGENT

async function readPromote() {
  return mergePromote((await liveAdventure()).promote);
}

async function writePromote(data) {
  const adventure = await liveAdventure();
  adventure.promote = data;
  await writeAdventure(adventure);
}

function siteBaseUrl(req) {
  const fromEnv = String(process.env.PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const host = String(req.headers.host || "localhost:3000");
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}

function signupUrlFor(req, platform) {
  const source = encodeURIComponent(platform || "promote");
  return `${siteBaseUrl(req)}/?utm_source=${source}&utm_medium=promote&utm_campaign=lfg`;
}

function formatWhen(slot) {
  if (!slot?.date) return "";
  const length = slot.lengthMinutes ? `${slot.lengthMinutes} min` : "";
  return [slot.date, slot.time, slot.timezone, length].filter(Boolean).join(" ");
}

function currentSession() {
  return liveAdventure().then((adventure) => publicSession(adventure));
}

function clipText(text, max) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).trim()}…`;
}

function adventureVars(session) {
  const adventureTitle = String(session?.title || "An AMBA Adventure").trim();
  const hookText = String(session?.playerHookText || "").trim();
  const parts = hookText
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const hookTitle = parts[0] || adventureTitle;
  const hookRest = parts.slice(1).join(" ");
  const format = String(session?.format || "").trim();
  const playFormat = /remote|online/i.test(format) || !format ? "Online" : format;
  return {
    adventureTitle,
    hookTitle,
    hook: clipText(hookRest || hookTitle, 450),
    hookShort: clipText(hookRest || hookTitle, 220),
    playFormat,
    scope: String(session?.scope || "Short adventure").trim(),
    players: String(session?.targetPlayers || 4)
  };
}

function fillPlaceholders(text, vars) {
  return String(text || "").replace(/\{\{(\w+)\}\}/g, (_, key) => (
    vars[key] == null ? "" : String(vars[key])
  ));
}

async function promoteVars(req, platform) {
  const session = await currentSession();
  const slot = await leadingYesSlot();
  return {
    ...adventureVars(session),
    signupUrl: signupUrlFor(req, platform),
    discordInvite: discordInviteUrl,
    when: formatWhen(slot)
  };
}

function redditConfigured() {
  return Boolean(
    String(process.env.REDDIT_CLIENT_ID || "").trim() &&
    String(process.env.REDDIT_CLIENT_SECRET || "").trim() &&
    String(process.env.REDDIT_USERNAME || "").trim() &&
    String(process.env.REDDIT_PASSWORD || "").trim()
  );
}

function redditUserAgent() {
  return String(process.env.REDDIT_USER_AGENT || "amba-test-promote/0.1 by AMBA-test").trim();
}

function resolveWebhook(stored, override) {
  return String(override || stored || process.env.DISCORD_LFG_WEBHOOK || "").trim();
}

function redactWebhook(url) {
  const value = String(url || "");
  if (!value) return "";
  return `…${value.slice(-6)}`;
}

function publicPost(post) {
  return {
    id: post.id,
    platform: post.platform,
    status: post.status,
    destination: post.destination || "",
    title: post.title || "",
    body: post.body || "",
    permalink: post.permalink || "",
    remoteId: post.remoteId || "",
    createdAt: post.createdAt,
    updatedAt: post.updatedAt
  };
}

async function publicPromote(req) {
  const data = await readPromote();
  const redditVars = await promoteVars(req, "reddit");
  const discordVars = await promoteVars(req, "discord");
  const facebookVars = await promoteVars(req, "facebook");
  const webhook = resolveWebhook(data.settings.discordWebhookUrl, "");
  return {
    templates: data.templates,
    settings: {
      redditSubreddit: data.settings.redditSubreddit,
      discordWebhookHint: redactWebhook(webhook),
      discordWebhookSet: Boolean(webhook)
    },
    posts: data.posts.map(publicPost).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    signupBase: siteBaseUrl(req),
    discordInvite: discordInviteUrl,
    when: redditVars.when,
    adventure: {
      title: redditVars.adventureTitle,
      hookTitle: redditVars.hookTitle
    },
    redditCanPost: redditConfigured(),
    previews: {
      reddit: {
        title: fillPlaceholders(data.templates.reddit.title, redditVars),
        body: fillPlaceholders(data.templates.reddit.body, redditVars)
      },
      discord: {
        body: fillPlaceholders(data.templates.discord.body, discordVars)
      },
      facebook: {
        body: fillPlaceholders(data.templates.facebook.body, facebookVars)
      }
    }
  };
}

async function savePromoteTemplates(body, req) {
  const data = await readPromote();
  if (body.reddit) {
    data.templates.reddit.title = String(body.reddit.title || data.templates.reddit.title);
    data.templates.reddit.body = String(body.reddit.body || data.templates.reddit.body);
  }
  if (body.discord) data.templates.discord.body = String(body.discord.body || data.templates.discord.body);
  if (body.facebook) data.templates.facebook.body = String(body.facebook.body || data.templates.facebook.body);
  await writePromote(data);
  return publicPromote(req);
}

async function savePromoteSettings(body, req) {
  const data = await readPromote();
  if (body.redditSubreddit !== undefined) {
    data.settings.redditSubreddit = String(body.redditSubreddit || "lfg").replace(/^r\//i, "").trim() || "lfg";
  }
  if (body.discordWebhookUrl !== undefined) {
    const next = String(body.discordWebhookUrl || "").trim();
    if (next) data.settings.discordWebhookUrl = next;
  }
  await writePromote(data);
  return publicPromote(req);
}

async function createPromotePost(body, req) {
  const platform = String(body.platform || "").toLowerCase();
  if (!["reddit", "discord", "facebook"].includes(platform)) {
    const error = new Error("invalid_json");
    throw error;
  }
  const data = await readPromote();
  const vars = await promoteVars(req, platform);
  const title = fillPlaceholders(body.title ?? data.templates.reddit.title, vars);
  const rawBody = fillPlaceholders(body.body ?? data.templates[platform].body, vars);
  const now = new Date().toISOString();
  const post = {
    id: crypto.randomUUID(),
    platform,
    status: "copied",
    destination: "",
    title: platform === "reddit" ? title : "",
    body: rawBody,
    permalink: "",
    remoteId: "",
    createdAt: now,
    updatedAt: now
  };

  if (platform === "facebook" || body.copyOnly) {
    if (platform === "reddit") {
      post.destination = String(body.subreddit || data.settings.redditSubreddit || "lfg").replace(/^r\//i, "");
    }
    if (platform === "facebook") post.destination = "facebook groups";
    data.posts.push(post);
    await writePromote(data);
    const openUrl = platform === "reddit"
      ? `https://www.reddit.com/r/${post.destination}/submit`
      : "https://www.facebook.com/";
    return { mode: "copy", openUrl, post: publicPost(post), promote: await publicPromote(req) };
  }

  if (platform === "discord") {
    const webhook = resolveWebhook(data.settings.discordWebhookUrl, body.webhookUrl);
    if (!/^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+/i.test(webhook)) {
      throw new Error("invalid_json");
    }
    const sent = await discordWebhookPost(webhook, rawBody);
    post.status = "live";
    post.destination = "discord webhook";
    post.remoteId = sent.id;
    post.permalink = sent.url || "";
    data.posts.push(post);
    await writePromote(data);
    return { mode: "posted", post: publicPost(post), promote: await publicPromote(req) };
  }

  if (platform === "reddit") {
    if (!redditConfigured()) {
      post.destination = String(body.subreddit || data.settings.redditSubreddit || "lfg").replace(/^r\//i, "");
      data.posts.push(post);
      await writePromote(data);
      return {
        mode: "copy",
        openUrl: `https://www.reddit.com/r/${post.destination}/submit`,
        post: publicPost(post),
        promote: await publicPromote(req)
      };
    }
    const subreddit = String(body.subreddit || data.settings.redditSubreddit || "lfg").replace(/^r\//i, "");
    const submitted = await redditSubmit({ subreddit, title, text: rawBody });
    post.status = "live";
    post.destination = subreddit;
    post.remoteId = submitted.name;
    post.permalink = submitted.url;
    data.posts.push(post);
    await writePromote(data);
    return { mode: "posted", post: publicPost(post), promote: await publicPromote(req) };
  }

  throw new Error("invalid_json");
}

async function setPromotePermalink(id, body, req) {
  const data = await readPromote();
  const post = data.posts.find((item) => item.id === id);
  if (!post) throw new Error("not_found");
  post.permalink = String(body.permalink || "").trim();
  post.updatedAt = new Date().toISOString();
  if (post.status === "copied" && post.permalink) post.status = "live";
  await writePromote(data);
  return { post: publicPost(post), promote: await publicPromote(req) };
}

async function patchPromotePost(id, body, req) {
  const data = await readPromote();
  const post = data.posts.find((item) => item.id === id);
  if (!post) throw new Error("not_found");
  if (body.status === "filled") {
    post.status = "filled";
    post.updatedAt = new Date().toISOString();
    await writePromote(data);
    return { post: publicPost(post), promote: await publicPromote(req) };
  }
  if (body.body !== undefined) post.body = String(body.body);
  if (body.title !== undefined) post.title = String(body.title);
  if (post.platform === "discord" && post.remoteId) {
    const webhook = resolveWebhook(data.settings.discordWebhookUrl, body.webhookUrl);
    await discordWebhookEdit(webhook, post.remoteId, post.body);
    post.status = "edited";
  } else if (post.platform === "reddit" && post.remoteId && redditConfigured()) {
    await redditEdit(post.remoteId, post.body);
    post.status = "edited";
  }
  post.updatedAt = new Date().toISOString();
  await writePromote(data);
  return { post: publicPost(post), promote: await publicPromote(req) };
}

async function deletePromotePost(id, forget, req) {
  const data = await readPromote();
  const post = data.posts.find((item) => item.id === id);
  if (!post) throw new Error("not_found");
  if (forget) {
    data.posts = data.posts.filter((item) => item.id !== id);
    await writePromote(data);
    return { ok: true, promote: await publicPromote(req) };
  }
  if (post.platform === "discord" && post.remoteId) {
    const webhook = resolveWebhook(data.settings.discordWebhookUrl, "");
    await discordWebhookDelete(webhook, post.remoteId);
  } else if (post.platform === "reddit" && post.remoteId && redditConfigured()) {
    await redditDelete(post.remoteId);
  }
  post.status = "deleted";
  post.updatedAt = new Date().toISOString();
  await writePromote(data);
  return { post: publicPost(post), promote: await publicPromote(req) };
}

async function discordWebhookPost(webhook, content) {
  const response = await fetch(`${webhook}?wait=true`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content,
      embeds: [{ title: "Looking for players" }]
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "discord_error");
  }
  return { id: String(data.id || ""), url: data.url || "" };
}

async function discordWebhookEdit(webhook, messageId, content) {
  const response = await fetch(`${webhook}/messages/${messageId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content,
      embeds: [{ title: "Looking for players" }]
    })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "discord_error");
  }
}

async function discordWebhookDelete(webhook, messageId) {
  const response = await fetch(`${webhook}/messages/${messageId}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "discord_error");
  }
}

async function redditToken() {
  const id = String(process.env.REDDIT_CLIENT_ID || "").trim();
  const secret = String(process.env.REDDIT_CLIENT_SECRET || "").trim();
  const username = String(process.env.REDDIT_USERNAME || "").trim();
  const password = String(process.env.REDDIT_PASSWORD || "").trim();
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": redditUserAgent()
    },
    body: new URLSearchParams({
      grant_type: "password",
      username,
      password
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error || "reddit_auth");
  }
  return data.access_token;
}

async function redditForm(pathName, params) {
  const token = await redditToken();
  const response = await fetch(`https://oauth.reddit.com${pathName}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": redditUserAgent()
    },
    body: new URLSearchParams(params)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || "reddit_error");
  }
  const errors = data.json?.errors;
  if (Array.isArray(errors) && errors.length) {
    throw new Error(errors.map((item) => item[0] || item).join(", "));
  }
  return data;
}

async function redditSubmit({ subreddit, title, text }) {
  const data = await redditForm("/api/submit", {
    kind: "self",
    sr: subreddit,
    title,
    text,
    api_type: "json"
  });
  const result = data.json?.data || {};
  return {
    name: result.name || "",
    url: result.url || (result.id ? `https://www.reddit.com/r/${subreddit}/comments/${result.id}/` : "")
  };
}

async function redditEdit(thingId, text) {
  await redditForm("/api/editusertext", {
    thing_id: thingId,
    text,
    api_type: "json"
  });
}

async function redditDelete(thingId) {
  await redditForm("/api/del", { id: thingId });
}

function createHandle(users) {
  for (let i = 0; i < 80; i += 1) {
    const handle = `${pick(adjectives)}-${pick(nouns)}`;
    if (!users.some((user) => user.handle === handle)) return handle;
  }
  return `${pick(adjectives)}-${pick(nouns)}-${crypto.randomInt(100, 999)}`;
}

function pick(items) {
  return items[crypto.randomInt(0, items.length)];
}

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fsSync.existsSync(envPath)) return;
  for (const line of fsSync.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function passwordsMatch(given, expected) {
  const left = Buffer.from(String(given || ""));
  const right = Buffer.from(String(expected || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function yesEmails() {
  const signups = (await liveAdventure()).signups || [];
  const seen = new Set();
  const emails = [];
  for (const signup of signups) {
    const saidYes = Object.values(signup.votes || {}).includes("yes");
    if (!saidYes || seen.has(signup.email)) continue;
    seen.add(signup.email);
    emails.push({
      email: signup.email,
      handle: signup.handle || ""
    });
  }
  emails.sort((a, b) => a.handle.localeCompare(b.handle) || a.email.localeCompare(b.email));
  return emails;
}

async function adminSelfEmail() {
  const fromEnv = normalizeEmail(process.env.ADMIN_EMAIL);
  if (fromEnv) return fromEnv;
  const session = await liveAdventure();
  const created = (session.times || []).map((time) => normalizeEmail(time.createdBy)).find(Boolean);
  return created || "";
}

async function leadingYesSlot() {
  const session = await liveAdventure();
  const signups = session.signups || [];
  let best = null;
  for (const time of session?.times || []) {
    const yes = signups.filter((signup) => signup.votes?.[time.id] === "yes");
    const stamp = `${time.date || ""}T${time.time || "00:00"}`;
    if (
      !best ||
      yes.length > best.yesCount ||
      (yes.length === best.yesCount && stamp < `${best.date || ""}T${best.time || "00:00"}`)
    ) {
      best = {
        date: time.date || "",
        time: time.time || "",
        timezone: time.timezone || "",
        lengthMinutes: time.lengthMinutes || null,
        yesCount: yes.length,
        handles: yes.map((signup) => signup.handle).filter(Boolean)
      };
    }
  }
  return best;
}

async function adminYesMail() {
  const modules = await listAmbaModules();
  return {
    emails: await yesEmails(),
    selfEmail: await adminSelfEmail(),
    slot: await leadingYesSlot(),
    modules,
    ...(await sessionLinks())
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeHandle(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

function formatVotes(votes) {
  return Object.entries(votes)
    .filter(([, value]) => value)
    .map(([title, value]) => `${title}: ${value}`)
    .join("; ");
}

function toCsv(rows, fields) {
  return [fields, ...rows.map((row) => fields.map((field) => row[field] || ""))]
    .map((line) => line.map(csvCell).join(","))
    .join("\n");
}

function csvCell(value) {
  return `"${String(value || "").replaceAll("\"", "\"\"")}"`;
}
