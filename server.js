const http = require("node:http");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

loadEnv();

const root = __dirname;
const dataDir = path.join(root, "data");
const port = Number(process.env.PORT || 3000);
const adminPassword = String(process.env.ADMIN_PASSWORD || "").trim();
const adminTokens = new Set();
const currentSessionId = "amba-workflow-test-1";
const discordGuildId = "1534196054944121074";

const jsonFiles = {
  users: path.join(dataDir, "users.json"),
  sessions: path.join(dataDir, "sessions.json"),
  signups: path.join(dataDir, "signups.json"),
  feedback: path.join(dataDir, "feedback.json")
};

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
    if (code === "bad_filename" || code === "invalid_json") {
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

  if (req.method === "POST" && url.pathname === "/api/signup") {
    const body = await readBody(req);
    const user = await upsertUser(body);
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const user = await upsertUser({ email: body.email });
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/delete-account") {
    const body = await readBody(req);
    await deleteAccount(body.email);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/session") {
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
    sendJson(res, 200, { emails: await yesEmails() });
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
    sendJson(res, 200, { ok: true, emails: await yesEmails() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/export/signups.csv") {
    const signups = await readJson("signups");
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
  const sessions = await readJson("sessions");
  const signups = await readJson("signups");
  const feedback = await readJson("feedback");
  const user = email ? await findUserByEmail(email) : null;
  const session = sessions.find((item) => item.id === currentSessionId);
  const times = (session?.times || []).map((time) => ({
    ...time,
    participants: signups
      .filter((signup) => signup.votes?.[time.id])
      .map((signup) => ({
        handle: signup.handle,
        status: signup.votes[time.id] === "in" ? "" : signup.votes[time.id],
        mine: Boolean(user && signup.email === user.email)
      }))
  }));

  return {
    session: session ? { ...session, times } : null,
    user: user ? publicUser(user) : null,
    signups: signups.map(publicSignup),
    feedback: feedback.map(publicFeedback)
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
  await writeJson("signups", (await readJson("signups")).filter((item) => item.email !== normalized));
  await writeJson("feedback", (await readJson("feedback")).filter((item) => item.email !== normalized));
}

function sanitizeHttpUrl(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

async function saveSession(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("login_required");

  const sessions = await readJson("sessions");
  const session = sessions.find((item) => item.id === currentSessionId);
  if (!session) throw new Error("Session is missing.");

  session.syndicationUrl = sanitizeHttpUrl(data.syndicationUrl);
  session.playerHookUrl = sanitizeHttpUrl(data.playerHookUrl);
  session.updatedAt = new Date().toISOString();
  await writeJson("sessions", sessions);
  return {
    id: session.id,
    title: session.title,
    syndicationUrl: session.syndicationUrl || "",
    playerHookUrl: session.playerHookUrl || ""
  };
}

async function addTime(data) {
  const sessions = await readJson("sessions");
  const session = sessions.find((item) => item.id === currentSessionId);
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
  await writeJson("sessions", sessions);
  return time;
}

async function saveSlot(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("User is required.");

  const timeId = String(data.timeId || "").trim();
  if (!timeId) throw new Error("Time is required.");

  const signups = await readJson("signups");
  const existing = signups.find((item) => item.email === user.email);
  const record = existing || {
    id: crypto.randomUUID(),
    email: user.email,
    createdAt: new Date().toISOString()
  };

  record.handle = user.handle;
  record.discord = user.discord;
  record.timezone = user.timezone;
  record.role = user.role;
  record.characterStatus = user.characterStatus;
  record.votes = { ...(record.votes || {}) };
  record.updatedAt = new Date().toISOString();

  if (data.status === "leave") {
    delete record.votes[timeId];
  } else if (data.status === "yes" || data.status === "maybe" || data.status === "no") {
    record.votes[timeId] = data.status;
  } else {
    record.votes[timeId] = record.votes[timeId] || "in";
  }

  if (!existing) signups.push(record);
  await writeJson("signups", signups);
  return record;
}

async function saveAvailability(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("User is required.");

  if (data.suggestedTime?.title) {
    await addTime({ ...data.suggestedTime, email: user.email });
  }

  const signups = await readJson("signups");
  const existing = signups.find((item) => item.email === user.email);
  const record = existing || {
    id: crypto.randomUUID(),
    email: user.email,
    createdAt: new Date().toISOString()
  };

  record.handle = user.handle;
  record.discord = user.discord;
  record.timezone = user.timezone;
  record.role = user.role;
  record.characterStatus = user.characterStatus;
  record.votes = { ...(record.votes || {}), ...(data.votes || {}) };
  record.suggestedTime = data.suggestedTime || null;
  record.notes = String(data.notes || "").trim();
  record.updatedAt = new Date().toISOString();

  if (!existing) signups.push(record);
  await writeJson("signups", signups);
  return record;
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

function publicUser(user) {
  return {
    email: user.email,
    handle: user.handle,
    discord: user.discord,
    timezone: user.timezone,
    characterStatus: user.characterStatus,
    role: user.role
  };
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
  const viewer = normalizeEmail(viewerEmail);
  const names = await fs.readdir(WG_EXPORT_DIR);
  const files = [];
  let usedBytes = 0;
  for (const name of names) {
    const safe = safeZipExportName(name);
    if (!safe) continue;
    const st = await fs.stat(path.join(WG_EXPORT_DIR, name));
    usedBytes += st.size;
    files.push({
      name: safe,
      size: st.size,
      handle: index[safe]?.handle || "",
      mine: Boolean(viewer && normalizeEmail(index[safe]?.email) === viewer),
      updatedAt: index[safe]?.updatedAt || st.mtime.toISOString()
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
  return JSON.parse(await fs.readFile(jsonFiles[name], "utf8"));
}

async function writeJson(name, value) {
  await fs.writeFile(jsonFiles[name], `${JSON.stringify(value, null, 2)}\n`);
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
  const signups = await readJson("signups");
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
