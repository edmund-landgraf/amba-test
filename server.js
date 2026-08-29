const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const root = __dirname;
const dataDir = path.join(root, "data");
const port = Number(process.env.PORT || 3000);
const currentSessionId = "amba-workflow-test-1";

const jsonFiles = {
  users: path.join(dataDir, "users.json"),
  sessions: path.join(dataDir, "sessions.json"),
  signups: path.join(dataDir, "signups.json"),
  feedback: path.join(dataDir, "feedback.json")
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
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
    sendJson(res, 500, { error: "server_error", detail: error.message });
  }
});

server.listen(port, () => {
  console.log(`AMBA test site listening on http://localhost:${port}`);
});

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/state") {
    const email = normalizeEmail(url.searchParams.get("email"));
    const state = await getState(email);
    sendJson(res, 200, state);
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
    const user = await findUserByEmail(body.email);
    if (!user) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/delete-account") {
    const body = await readBody(req);
    await deleteAccount(body.email);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/times") {
    const body = await readBody(req);
    const time = await addTime(body);
    sendJson(res, 200, { time });
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

async function getState(email) {
  const sessions = await readJson("sessions");
  const signups = await readJson("signups");
  const feedback = await readJson("feedback");
  const user = email ? await findUserByEmail(email) : null;
  const session = sessions.find((item) => item.id === currentSessionId);

  return {
    session,
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
  const handle = normalizeHandle(data.handle) || createHandle(users);

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

async function addTime(data) {
  const sessions = await readJson("sessions");
  const session = sessions.find((item) => item.id === currentSessionId);
  const title = String(data.title || "").trim();
  if (!title) throw new Error("Time title is required.");

  const time = {
    id: crypto.randomUUID(),
    title,
    note: String(data.note || "").trim(),
    createdBy: normalizeEmail(data.email),
    createdAt: new Date().toISOString()
  };

  session.times.push(time);
  await writeJson("sessions", sessions);
  return time;
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
  record.votes = data.votes || {};
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

function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
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
