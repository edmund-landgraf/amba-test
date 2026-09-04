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
const ADMIN_COOKIE = "ambaAdminToken";
const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const {
  FALLBACK_ADVENTURE_ID,
  emptyAdventure,
  safeAdventureId,
  mergePromote
} = require("./lib/adventure-defaults");
const backup = require("./lib/runtime-backup");
const questionnaire = require("./lib/questionnaire");
const { provisionNewAdventure } = require("./lib/module-switch");
const {
  displayAdventureTitle,
  isArtifactTitle,
  adoptScrapedTitle,
  moduleTitleFromSyndication
} = require("./lib/adventure-title");
const linkPreview = require("./lib/link-preview");
const {
  DEFAULT_DISCORD_HOSTS,
  listDiscordHosts,
  parseDiscordGuildId,
  sanitizeBannerUrl,
  resolveDiscordHost,
  coerceDiscordHost,
  hostedByBannerHeight
} = require("./lib/discord-hosts");
const {
  MAX_WG_CHARACTER_OPTIONS,
  ensurePrivateCharacterOption,
  isPrivateCharacterSheet,
  publicPrivateCharacter,
  removePrivateCharacterOption
} = require("./lib/private-characters");
const discordGuildId = "1534196054944121074";

const jsonFiles = {
  users: path.join(runtimeDir, "users.json"),
  feedback: path.join(runtimeDir, "feedback.json"),
  questionnaire: path.join(runtimeDir, "questionnaire.json")
};

const jsonDefaults = {
  users: [],
  feedback: [],
  questionnaire: questionnaire.defaultQuestionnaire
};

const PAST_SESSION_LOCK_MS = 15 * 60 * 1000;
let zoneIanaPromise;

function zoneIanaMap() {
  if (!zoneIanaPromise) zoneIanaPromise = import("./timezones.js").then((mod) => mod.ZONE_IANA);
  return zoneIanaPromise;
}

function ianaForLabel(label, zoneIana) {
  if (zoneIana[label]) return zoneIana[label];
  try {
    Intl.DateTimeFormat(undefined, { timeZone: label });
    return label;
  } catch {
    return "UTC";
  }
}

function tzOffsetMs(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUTC - date.getTime();
}

function wallTimeToUtc(dateStr, timeStr, zoneLabel, zoneIana) {
  if (!dateStr || !timeStr) return null;
  const timeZone = ianaForLabel(zoneLabel || "Pacific", zoneIana);
  const [year, month, day] = String(dateStr).split("-").map(Number);
  const [hour, minute] = String(timeStr || "00:00").split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i += 1) {
    const offset = tzOffsetMs(new Date(utc), timeZone);
    utc = Date.UTC(year, month - 1, day, hour, minute, 0) - offset;
  }
  return new Date(utc);
}

function desiredPlayerCount(adventure) {
  const n = Number(adventure?.targetPlayers);
  return Number.isFinite(n) && n > 0 ? Math.min(12, Math.round(n)) : 4;
}

function partySlotCounts(adventure) {
  let max = Number(adventure?.maxPartyPcs);
  let play = Number(adventure?.playPartyPcs);
  let perPlayer = Number(adventure?.maxPcsPerPlayer);
  max = Number.isFinite(max) && max > 0 ? Math.min(16, Math.round(max)) : 8;
  play = Number.isFinite(play) && play > 0 ? Math.min(16, Math.round(play)) : 4;
  perPlayer = Number.isFinite(perPlayer) && perPlayer > 0 ? Math.min(6, Math.round(perPlayer)) : 2;
  if (play > max) play = max;
  return { maxPartyPcs: max, playPartyPcs: play, maxPcsPerPlayer: perPlayer };
}

function yesCountForTime(adventure, timeId) {
  return (adventure.signups || []).filter((signup) => signup.votes?.[timeId] === "yes").length;
}

async function applyPastSessionLocks(adventure) {
  const zoneIana = await zoneIanaMap();
  const desired = desiredPlayerCount(adventure);
  const now = Date.now();
  let changed = false;
  for (const time of adventure.times || []) {
    if (time.signupsDisabled) continue;
    if (yesCountForTime(adventure, time.id) >= desired) continue;
    const start = wallTimeToUtc(time.date, time.time, time.timezone || "Pacific", zoneIana);
    if (!start || Number.isNaN(start.getTime())) continue;
    if (now < start.getTime() + PAST_SESSION_LOCK_MS) continue;
    time.signupsDisabled = true;
    time.updatedAt = new Date().toISOString();
    changed = true;
  }
  if (changed) await writeAdventure(adventure);
  return adventure;
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
  fsSync.mkdirSync(path.join(runtimeDir, "backups"), { recursive: true });
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
const IMPORT_BODY_MAX = 8 * 1024 * 1024;
const WG_EXPORT_MAX_TOTAL = 50 * 1024 * 1024;
const WG_EXPORT_DIR = path.join(dataDir, "wg-exports");
const WG_EXPORT_INDEX = path.join(dataDir, "wg-exports-index.json");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
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
    if (code === "forbidden" || code === "signups_disabled") {
      sendJson(res, 403, { error: code });
      return;
    }
    if (code === "not_found") {
      sendJson(res, 404, { error: code });
      return;
    }
    if (code === "bad_filename" || code === "invalid_json" || code === "bad_sheet_url" || code === "sheet_limit" || code === "not_public" || code === "party_per_player_limit" || code === "discord_url_required" || code === "discord_host_unknown" || code === "questionnaire_invalid" || code === "slot_in_past") {
      sendJson(res, 400, { error: code, details: error.details || undefined });
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
    const guildId = parseDiscordGuildId(url.searchParams.get("guildId"));
    sendJson(res, 200, await discordWidgetStatus(guildId));
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
      "cache-control": "no-store"
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
    const name = safeZipExportName(url.searchParams.get("name"));
    if (!name) {
      sendJson(res, 400, { error: "bad_filename" });
      return;
    }
    const index = await readExportIndex();
    const record = index[name];
    if (!record || (normalizeEmail(record.email) !== email && !hasAdminAccess(req))) {
      sendJson(res, 403, { error: "forbidden" });
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

  if (req.method === "POST" && url.pathname === "/api/private-characters") {
    const body = await readBody(req);
    sendJson(res, 200, await savePrivateCharacter(body));
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/private-characters") {
    sendJson(res, 200, await deletePrivateCharacter({
      email: url.searchParams.get("email"),
      name: url.searchParams.get("name")
    }));
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

  if (req.method === "DELETE" && url.pathname === "/api/party-pcs") {
    const result = await excludePartyPc({
      email: url.searchParams.get("email"),
      url: url.searchParams.get("url"),
      privateExportName: url.searchParams.get("privateExportName")
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/party-pcs") {
    const body = await readBody(req);
    sendJson(res, 200, await includePartyPc(body));
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

  if (
    req.method === "GET"
    && (url.pathname === "/api/export/me.json" || url.pathname === "/api/export/me")
  ) {
    const email = normalizeEmail(url.searchParams.get("email"));
    try {
      const node = backup.buildUserNode(await backup.loadRuntime(dataDir), email);
      const name = backup.userExportFileName(node.user?.handle || "user");
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store"
      });
      res.end(`${JSON.stringify(node, null, 2)}\n`);
    } catch (error) {
      sendJson(res, 200, backup.buildUserNode({
        site: {},
        users: [],
        adventures: [],
        feedback: [],
        questionnaire: questionnaire.defaultQuestionnaire,
        wgExportIndex: {}
      }, email));
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/import/me") {
    const body = await readImportBody(req);
    const email = normalizeEmail(body?.email);
    const state = await backup.loadRuntime(dataDir);
    const merged = backup.mergeUserNode(state, body, email);
    await backup.applyImport(dataDir, merged);
    sendJson(res, 200, { ok: true, kind: "user-node", email });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/questionnaire") {
    const data = await readQuestionnaire();
    sendJson(res, 200, questionnaire.publicQuestionnaire(data, url.searchParams.get("email")));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/questionnaire/response") {
    const body = await readBody(req);
    const user = await findUserByEmail(body.email);
    if (!user) throw new Error("login_required");
    const saved = await saveQuestionnaireResponse(user, body.answers || {});
    sendJson(res, 200, {
      response: {
        handle: saved.handle,
        answers: saved.answers,
        submittedAt: saved.submittedAt,
        updatedAt: saved.updatedAt
      }
    });
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

  if (req.method === "POST" && url.pathname === "/api/admin/session/refresh") {
    if (!requireAdmin(req, res)) return;
    try {
      sendJson(res, 200, { session: await refreshLiveSessionFromApi() });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "refresh_failed" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/desired-players") {
    const body = await readBody(req);
    sendJson(res, 200, await saveDesiredPlayers(body));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/party-slots") {
    const body = await readBody(req);
    sendJson(res, 200, await savePartySlots(body));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/discord-host") {
    const body = await readBody(req);
    sendJson(res, 200, await saveDiscordHost(body));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/discord-host") {
    if (!requireAdmin(req, res)) return;
    const session = await liveAdventure();
    sendJson(res, 200, {
      discordHost: coerceDiscordHost(session.discordHost),
      discordHostChoices: await discordHostChoices()
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/discord-host") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      const saved = await saveDiscordHost(body, { requireUser: false });
      sendJson(res, 200, {
        ...saved,
        discordHostChoices: await discordHostChoices()
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "discord_host_failed" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/hosted-art") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req, 3 * 1024 * 1024);
    try {
      sendJson(res, 200, await saveDiscordBanner({
        ...body,
        clear: Boolean(body.clear || body.clearBanner)
      }));
    } catch (error) {
      sendJson(res, 400, { error: error.message || "hosted_art_failed" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/party-slots") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, partySlotCounts(await liveAdventure()));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/party-slots") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    sendJson(res, 200, await savePartySlots(body, { requireUser: false }));
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

  if (req.method === "GET" && url.pathname === "/api/admin/ok") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await readBody(req);
    if (!adminPassword || !passwordsMatch(String(body.password || "").trim(), adminPassword)) {
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }
    const token = mintAdminToken();
    adminTokens.add(token);
    sendJson(res, 200, { token }, { "set-cookie": adminCookieHeader(token) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/yes-emails") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, await adminYesMail());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/users") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, { users: await adminUsers() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/questionnaire") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, await readQuestionnaire());
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/admin/questionnaire") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    sendJson(res, 200, await saveQuestionnaireQuestions(body.questions || []));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/questionnaire/export.json") {
    if (!requireAdmin(req, res)) return;
    const data = await readQuestionnaire();
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": "attachment; filename=\"amba-questionnaire.json\"",
      "cache-control": "no-store"
    });
    res.end(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/reading") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, await getReadingLinks());
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/admin/reading") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    sendJson(res, 200, await saveReadingLinks(body.readingLinks || []));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/reading/refresh") {
    if (!requireAdmin(req, res)) return;
    try {
      const body = await readBody(req);
      sendJson(res, 200, await refreshReadingLink(body.id || body.url));
    } catch (error) {
      sendJson(res, 400, { error: error.message || "Could not refresh." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/amba-modules") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, await listAmbaModules());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/modules/select") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    sendJson(res, 200, await selectLiveAdventure(body.id));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/modules/switch") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    sendJson(res, 200, { ok: true, ...(await switchModule(body)), ...(await adminYesMail()) });
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

  if (req.method === "GET" && url.pathname === "/api/admin/export.json") {
    if (!requireAdmin(req, res)) return;
    const snapshot = await currentSnapshot();
    const name = backup.backupFileName();
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`
    });
    res.end(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/backups") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, { backups: await backup.listBackups(dataDir) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/backups") {
    if (!requireAdmin(req, res)) return;
    const snapshot = await currentSnapshot();
    sendJson(res, 200, await backup.writeBackupFile(dataDir, snapshot));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/backups/file") {
    if (!requireAdmin(req, res)) return;
    const filePath = backup.backupPath(dataDir, url.searchParams.get("name"));
    if (!filePath) {
      sendJson(res, 200, { ok: true, error: "unknown_backup" });
      return;
    }
    try {
      const file = await fs.readFile(filePath);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${path.basename(filePath)}"`
      });
      res.end(file);
    } catch {
      sendJson(res, 200, { ok: true, error: "unknown_backup" });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/admin/backups/file") {
    if (!requireAdmin(req, res)) return;
    const filePath = backup.backupPath(dataDir, url.searchParams.get("name"));
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch {
        /* missing file is fine */
      }
    }
    sendJson(res, 200, { ok: true, backups: await backup.listBackups(dataDir) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/import") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, await restoreFromPayload(await readImportBody(req)));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/backups/restore") {
    if (!requireAdmin(req, res)) return;
    const body = await readImportBody(req);
    if (body && typeof body === "object" && backup.isBackupFileName(body.name)) {
      const filePath = backup.backupPath(dataDir, body.name);
      let raw = {};
      try {
        raw = JSON.parse(await fs.readFile(filePath, "utf8"));
      } catch {
        raw = {};
      }
      sendJson(res, 200, await restoreFromPayload(raw));
      return;
    }
    sendJson(res, 200, await restoreFromPayload(body));
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
    const ext = path.extname(filePath);
    const headers = { "content-type": mime[ext] || "application/octet-stream" };
    if (ext === ".html" || ext === ".js" || ext === ".mjs" || ext === ".css") {
      headers["cache-control"] = "no-store";
    }
    res.writeHead(200, headers);
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

async function discordWidgetStatus(guildId) {
  if (!guildId) return { enabled: false };
  try {
    const response = await fetch(`https://discord.com/api/guilds/${guildId}/widget.json`);
    if (response.ok) return { enabled: true };
    return { enabled: false };
  } catch {
    return { enabled: false };
  }
}

async function getState(email) {
  let adventure = await applyPastSessionLocks(await liveAdventure());
  adventure = await refreshStaleReadingLinks(adventure);
  const scraped = adoptScrapedTitle(adventure.title, await scrapeModuleTitle(adventure));
  if (scraped) {
    adventure.title = scraped;
    adventure.updatedAt = new Date().toISOString();
    await writeAdventure(adventure);
  }
  const signups = adventure.signups || [];
  const feedback = await readJson("feedback");
  const users = await readJson("users");
  const user = email ? await findUserByEmail(email) : null;
  const tokenByEmail = new Map(users.map((item) => [item.email, item.tokenColor]));
  const desired = desiredPlayerCount(adventure);
  const times = (adventure.times || []).map((time) => {
    const { createdBy, ...publicTime } = time;
    const participants = signups
      .filter((signup) => signup.votes?.[time.id])
      .map((signup) => {
        const status = signup.votes[time.id] === "in" ? "" : signup.votes[time.id];
        const mine = Boolean(user && signup.email === user.email);
        const tokenColor = tokenByEmail.get(signup.email);
        return {
          handle: signup.handle,
          status,
          note: String(signup.voteNotes?.[time.id] || "").trim(),
          mine,
          tokenColor: tokenColor === 0 || tokenColor ? tokenColor : ""
        };
      });
    const yesCount = participants.filter((person) => person.status === "yes").length;
    const mineNote = user
      ? String(signups.find((signup) => signup.email === user.email)?.voteNotes?.[time.id] || "").trim()
      : "";
    return {
      ...publicTime,
      createdByMe: Boolean(user && createdBy && createdBy === user.email),
      signupsDisabled: Boolean(time.signupsDisabled),
      scheduledToPlay: !time.signupsDisabled && yesCount >= desired,
      mineNote,
      participants
    };
  });

  return {
    session: { ...publicSession(adventure), times },
    discordHostChoices: await discordHostChoices(),
    user: user ? publicUser(user, adventure) : null,
    signups: signups.map(publicSignup),
    feedback: feedback.map(publicFeedback),
    pcs: publicPcs(adventure, users, user?.email || "")
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
    existing.discordUserId = normalizeDiscordUserId(data.discordUserId !== undefined ? data.discordUserId : existing.discordUserId);
    existing.redditUserId = normalizeRedditUserId(data.redditUserId !== undefined ? data.redditUserId : existing.redditUserId);
    existing.preferredComm = normalizePreferredComm(
      data.preferredComm !== undefined ? data.preferredComm : existing.preferredComm
    );
    existing.tokenColor = data.tokenColor !== undefined
      ? normalizeStoredTokenColor(data.tokenColor)
      : (existing.tokenColor === 0 || existing.tokenColor ? existing.tokenColor : "");
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
    discordUserId: normalizeDiscordUserId(data.discordUserId),
    redditUserId: normalizeRedditUserId(data.redditUserId),
    preferredComm: normalizePreferredComm(data.preferredComm),
    tokenColor: normalizeStoredTokenColor(data.tokenColor),
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
  const questionnaireData = await readQuestionnaire();
  questionnaireData.responses = (questionnaireData.responses || []).filter((item) => item.email !== normalized);
  await writeQuestionnaire(questionnaireData);
  const names = await fs.readdir(adventuresDir);
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const adventure = JSON.parse(await fs.readFile(path.join(adventuresDir, name), "utf8"));
    adventure.signups = (adventure.signups || []).filter((item) => item.email !== normalized);
    adventure.wgSheets = (adventure.wgSheets || []).filter((item) => item.email !== normalized);
    await writeAdventure(adventure);
  }
}

async function readQuestionnaire() {
  return questionnaire.coerceQuestionnaire(await readJson("questionnaire"));
}

async function writeQuestionnaire(value) {
  await writeJson("questionnaire", questionnaire.coerceQuestionnaire(value));
}

async function saveQuestionnaireQuestions(questions) {
  const existing = await readQuestionnaire();
  const next = {
    questions: questionnaire.coerceQuestions(questions),
    responses: existing.responses || []
  };
  await writeQuestionnaire(next);
  return next;
}

async function saveQuestionnaireResponse(user, answers) {
  const existing = await readQuestionnaire();
  const saved = questionnaire.saveResponse(existing, user, answers);
  await writeQuestionnaire(saved.questionnaire);
  return saved.response;
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
    html, body {
      margin: 0;
      min-height: 100%;
      color: #1a1612;
      color-scheme: light;
      background-color: #f0e4c9;
      background-image:
        linear-gradient(165deg, rgba(255, 248, 230, 0.5), rgba(186, 154, 96, 0.16)),
        repeating-linear-gradient(0deg, rgba(92, 64, 32, 0.04) 0 1px, transparent 1px 3px),
        repeating-linear-gradient(90deg, rgba(92, 64, 32, 0.03) 0 1px, transparent 1px 4px);
    }
    body { font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
    a { pointer-events: auto; }
    .preview-root { padding: 4px 8px 12px; }
  </style>
  ${styles}
  <style>
    .preview-root {
      --amba-page: transparent;
      --amba-bg: transparent;
    }
    html, body,
    .embedded-document-root, .lore-box, .synd-content, .preview-root,
    .preview, .preview-narrative, .artifact-detail-html,
    .syndication-artifact, .module-overview, .outline-narrative-body,
    .read-aloud, .readaloud, .boxed-text {
      background: transparent !important;
      background-color: transparent !important;
      background-image: none !important;
      box-shadow: none !important;
      min-height: 0 !important;
    }
    html, body {
      min-height: 100% !important;
      background-color: #f0e4c9 !important;
      background-image:
        linear-gradient(165deg, rgba(255, 248, 230, 0.5), rgba(186, 154, 96, 0.16)),
        repeating-linear-gradient(0deg, rgba(92, 64, 32, 0.04) 0 1px, transparent 1px 3px),
        repeating-linear-gradient(90deg, rgba(92, 64, 32, 0.03) 0 1px, transparent 1px 4px) !important;
    }
  </style>
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
  const rewritten = html.replace(/\s(href|src)=["']([^"']+)["']/gi, (full, attr, value) => {
    if (!value || value.startsWith("#") || value.startsWith("data:") || value.startsWith("mailto:") || value.startsWith("javascript:")) {
      return full;
    }
    try {
      return ` ${attr}="${new URL(value, baseUrl).toString()}"`;
    } catch {
      return full;
    }
  });
  return rewritten.replace(/<a\b([^>]*)>/gi, (full, attrs) => {
    let next = attrs;
    if (!/\btarget=/i.test(next)) next += ' target="_blank"';
    if (!/\brel=/i.test(next)) next += ' rel="noopener noreferrer"';
    return `<a${next}>`;
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

async function scrapeModuleTitle(session) {
  const urls = [session.syndicationUrl, session.playerHookUrl].map(sanitizeHttpUrl).filter(Boolean);
  for (const url of urls) {
    try {
      const title = moduleTitleFromSyndication(await fetchPageHtml(url));
      if (title && !isArtifactTitle(title)) return title;
    } catch {
      // Try the next published URL.
    }
  }
  return "";
}

async function refreshSessionFromLinks(session) {
  const playerHookUrl = sanitizeHttpUrl(session.playerHookUrl);
  const title = adoptScrapedTitle(session.title, await scrapeModuleTitle(session));
  if (title) session.title = title;
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
  const title = adoptScrapedTitle(session.title, await scrapeModuleTitle(session));
  if (title) {
    session.title = title;
    session.updatedAt = new Date().toISOString();
    await writeAdventure(session);
  }
  return {
    title: displayAdventureTitle(session.title) || session.title || "",
    subtitle: String(session.subtitle || "").trim(),
    ambaModuleId: session.ambaModuleId || session.id || "",
    syndicationUrl: session.syndicationUrl || "",
    playerHookUrl: session.playerHookUrl || "",
    playerHookText: session.playerHookText || "",
    setupSource: session.setupSource === "manual" ? "manual" : "connect",
    displayHostedByBanner: session.displayHostedByBanner !== false,
    hostedByBannerHeight: hostedByBannerHeight(session.hostedByBannerHeight)
  };
}

function readingList(adventure) {
  return (Array.isArray(adventure.readingLinks) ? adventure.readingLinks : []).map((item) => ({
    id: item.id,
    url: item.url,
    kind: item.kind === "syndication" ? "syndication" : "web",
    title: item.title || "",
    description: item.description || "",
    image: item.image || "",
    siteName: item.siteName || "",
    artifactType: linkPreview.artifactType(item.url, `${item.title || ""}\n${item.description || ""}`, item.artifactType),
    fetchedAt: item.fetchedAt || "",
    fetchError: item.fetchError || ""
  }));
}

async function fetchPdfBytes(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { accept: "application/pdf,*/*", "user-agent": "amba-test-hook-preview" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Could not load PDF (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.length > 12_000_000 ? buffer.subarray(buffer.length - 12_000_000) : buffer;
}

async function scrapeReadingLink(url, id) {
  const safe = sanitizeHttpUrl(url);
  if (!safe) throw new Error("A valid http(s) URL is required.");
  try {
    const html = await fetchPageHtml(safe);
    let pdfTitle = "";
    if (linkPreview.artifactType(safe, html) === "pdf") {
      const pdfUrl = linkPreview.pdfUrlFromHtml(html, safe);
      if (pdfUrl) {
        try {
          pdfTitle = linkPreview.titleFromPdfBytes(await fetchPdfBytes(pdfUrl));
        } catch {
          pdfTitle = "";
        }
      }
    }
    return { id, ...linkPreview.fromHtml(safe, html, new Date().toISOString(), { pdfTitle }) };
  } catch (error) {
    return { id, ...linkPreview.failedPreview(safe, error.message) };
  }
}

async function refreshStaleReadingLinks(adventure) {
  const links = Array.isArray(adventure.readingLinks) ? adventure.readingLinks : [];
  if (!links.length) return adventure;
  let changed = false;
  const next = [];
  for (const item of links) {
    if (linkPreview.pdfNeedsRescrape(item, adventure.title)) {
      next.push(await scrapeReadingLink(item.url, item.id));
      changed = true;
    } else {
      next.push(item);
    }
  }
  if (!changed) return adventure;
  adventure.readingLinks = next;
  adventure.updatedAt = new Date().toISOString();
  await writeAdventure(adventure);
  return adventure;
}

async function getReadingLinks() {
  return { readingLinks: readingList(await liveAdventure()) };
}

async function saveReadingLinks(items) {
  const adventure = await liveAdventure();
  const previous = Array.isArray(adventure.readingLinks) ? adventure.readingLinks : [];
  const byId = new Map(previous.map((row) => [row.id, row]));
  const next = [];
  for (const item of Array.isArray(items) ? items : []) {
    const url = sanitizeHttpUrl(item?.url);
    if (!url) continue;
    const id = String(item.id || "").trim() || crypto.randomUUID();
    const existing = byId.get(id) || previous.find((row) => row.url === url);
    if (existing && existing.url === url) next.push({ ...existing, id, url });
    else next.push(await scrapeReadingLink(url, id));
  }
  adventure.readingLinks = next;
  adventure.updatedAt = new Date().toISOString();
  await writeAdventure(adventure);
  return { readingLinks: readingList(adventure) };
}

async function refreshReadingLink(idOrUrl) {
  const adventure = await liveAdventure();
  const key = String(idOrUrl || "").trim();
  const links = Array.isArray(adventure.readingLinks) ? [...adventure.readingLinks] : [];
  const index = links.findIndex((row) => row.id === key || row.url === sanitizeHttpUrl(key));
  if (index < 0) throw new Error("Reading link not found.");
  links[index] = await scrapeReadingLink(links[index].url, links[index].id);
  adventure.readingLinks = links;
  adventure.updatedAt = new Date().toISOString();
  await writeAdventure(adventure);
  return { readingLinks: readingList(adventure) };
}

async function refreshLiveSessionFromApi() {
  const session = await liveAdventure();
  if (!sanitizeHttpUrl(session.syndicationUrl) && !sanitizeHttpUrl(session.playerHookUrl)) {
    throw new Error("No adventure summary or player-hook URL to refresh.");
  }
  await refreshSessionFromLinks(session);
  session.updatedAt = new Date().toISOString();
  await writeAdventure(session);
  return sessionLinks();
}

async function saveSession(data) {
  const session = await liveAdventure();
  if (Object.prototype.hasOwnProperty.call(data || {}, "displayHostedByBanner")) {
    session.displayHostedByBanner = Boolean(data.displayHostedByBanner);
  }
  if (Object.prototype.hasOwnProperty.call(data || {}, "hostedByBannerHeight")) {
    session.hostedByBannerHeight = hostedByBannerHeight(data.hostedByBannerHeight);
  }
  if (data.mode === "hostedBy") {
    session.updatedAt = new Date().toISOString();
    await writeAdventure(session);
    return sessionLinks();
  }
  if (data.mode === "write" || data.setupSource === "manual") {
    session.setupSource = "manual";
    session.syndicationUrl = "";
    session.playerHookUrl = "";
    session.title = String(data.title || "").trim() || session.title;
    if (Object.prototype.hasOwnProperty.call(data || {}, "subtitle")) {
      session.subtitle = data.subtitle == null ? "" : String(data.subtitle).trim();
    }
    session.playerHookText = String(data.playerHookText || "");
    session.updatedAt = new Date().toISOString();
    await writeAdventure(session);
    return sessionLinks();
  }
  const playerHookUrl = sanitizeHttpUrl(data.playerHookUrl);
  let syndicationUrl = sanitizeHttpUrl(data.syndicationUrl) || syndicationFromHook(playerHookUrl);
  if (syndicationUrl && syndicationFromHook(syndicationUrl) !== syndicationUrl) {
    syndicationUrl = syndicationFromHook(syndicationUrl);
  }
  session.setupSource = "connect";
  session.syndicationUrl = syndicationUrl;
  session.playerHookUrl = playerHookUrl;
  if (data.ambaModuleId) session.ambaModuleId = String(data.ambaModuleId).trim();
  const apiTitle = displayAdventureTitle(data.title);
  if (apiTitle && !isArtifactTitle(apiTitle)) session.title = apiTitle;
  if (Object.prototype.hasOwnProperty.call(data || {}, "subtitle")) {
    session.subtitle = data.subtitle == null ? "" : String(data.subtitle).trim();
  }
  await refreshSessionFromLinks(session);
  if (apiTitle && !isArtifactTitle(apiTitle)) session.title = apiTitle;
  if (Object.prototype.hasOwnProperty.call(data || {}, "subtitle")) {
    session.subtitle = data.subtitle == null ? "" : String(data.subtitle).trim();
  }
  session.updatedAt = new Date().toISOString();
  await writeAdventure(session);
  return sessionLinks();
}

async function saveDesiredPlayers(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("login_required");
  const session = await liveAdventure();
  session.targetPlayers = desiredPlayerCount({ targetPlayers: data.desiredPlayers });
  session.updatedAt = new Date().toISOString();
  await writeAdventure(session);
  return { targetPlayers: session.targetPlayers };
}

async function savePartySlots(data, options = {}) {
  if (options.requireUser !== false) {
    const user = await findUserByEmail(data.email);
    if (!user) throw new Error("login_required");
  }
  const session = await liveAdventure();
  const slots = partySlotCounts({
    maxPartyPcs: data.maxPartyPcs,
    playPartyPcs: data.playPartyPcs,
    maxPcsPerPlayer: data.maxPcsPerPlayer
  });
  session.maxPartyPcs = slots.maxPartyPcs;
  session.playPartyPcs = slots.playPartyPcs;
  session.maxPcsPerPlayer = slots.maxPcsPerPlayer;
  session.updatedAt = new Date().toISOString();
  await writeAdventure(session);
  return slots;
}

async function discordHostChoices() {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dataDir, "discord-hosts.json"), "utf8"));
    const hosts = listDiscordHosts(raw);
    if (hosts.length) return hosts;
  } catch {
    /* use defaults */
  }
  return listDiscordHosts(DEFAULT_DISCORD_HOSTS);
}

async function saveDiscordHost(data, options = {}) {
  if (options.requireUser !== false) {
    const user = await findUserByEmail(data.email);
    if (!user) throw new Error("login_required");
  }
  const name = String(data.name || "").trim();
  const session = await liveAdventure();
  if (!name) {
    session.discordHost = null;
  } else {
    const choices = await discordHostChoices();
    const selected = choices.find((item) => item.name === name);
    const host = resolveDiscordHost({
      ...data,
      bannerUrl: data.clearBanner ? "" : (data.bannerUrl || selected?.bannerUrl || null),
      bannerHalfUrl: data.clearBanner ? "" : (data.bannerHalfUrl || selected?.bannerHalfUrl || null)
    }, choices);
    session.discordHost = host;
  }
  session.updatedAt = new Date().toISOString();
  await writeAdventure(session);
  return { discordHost: coerceDiscordHost(session.discordHost) };
}

async function writeDiscordHostsFile(hosts) {
  await fs.writeFile(path.join(dataDir, "discord-hosts.json"), `${JSON.stringify(hosts, null, 2)}\n`);
}

async function writeHostedBannerFile(hostName, data) {
  const ext = String(data.ext || "").replace(/^\./, "").toLowerCase().replace(/^jpeg$/, "jpg");
  if (!["png", "jpg", "webp"].includes(ext)) throw new Error("bad_filename");
  const raw = String(data.file || "").replace(/^data:[^;]+;base64,/, "");
  const buf = Buffer.from(raw, "base64");
  if (!buf.length || buf.length > 2 * 1024 * 1024) throw new Error("payload_too_large");
  const slug = String(hostName || "custom").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom";
  const fileName = `hosted-${slug}.${ext}`;
  await fs.mkdir(path.join(root, "images"), { recursive: true });
  await fs.writeFile(path.join(root, "images", fileName), buf);
  return `/images/${fileName}`;
}

async function saveDiscordBanner(data) {
  const session = await liveAdventure();
  const name = String(data.name || "").trim();
  let host = coerceDiscordHost(session.discordHost);
  if (name) {
    host = resolveDiscordHost({
      ...data,
      bannerUrl: data.clear ? "" : (host?.bannerUrl || ""),
      bannerHalfUrl: data.clear ? "" : (host?.bannerHalfUrl || "")
    }, await discordHostChoices());
  }
  if (!host) throw new Error("discord_host_unknown");
  let bannerUrl = "";
  if (!data.clear) {
    bannerUrl = await writeHostedBannerFile(host.name, data);
  }
  host.bannerUrl = bannerUrl;
  if (data.clear) host.bannerHalfUrl = "";
  session.discordHost = host;
  session.updatedAt = new Date().toISOString();
  await writeAdventure(session);
  const choices = await discordHostChoices();
  const named = choices.find((item) => item.name === host.name);
  if (named) {
    named.bannerUrl = bannerUrl;
    if (data.clear) named.bannerHalfUrl = "";
    await writeDiscordHostsFile(choices.map((item) => ({
      name: item.name,
      desc: item.desc,
      inviteLink: item.inviteLink,
      bannerUrl: item.bannerUrl || null,
      bannerHalfUrl: item.bannerHalfUrl || null
    })));
  }
  return { discordHost: coerceDiscordHost(session.discordHost), discordHostChoices: await discordHostChoices() };
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
  const lockOp = data.signupsDisabled === true || data.signupsDisabled === false || Boolean(data.convertYesToMaybe);
  if (!lockOp && (!time.createdBy || time.createdBy !== user.email)) throw new Error("forbidden");

  const date = String(data.date || "").trim();
  const clock = String(data.time || "").trim();
  const lengthMinutes = Number(data.lengthMinutes || data.length || 0);
  const hasSchedule = Boolean(date && clock && lengthMinutes);
  const disableToggle = data.signupsDisabled === true || data.signupsDisabled === false;
  if (!hasSchedule && !disableToggle) throw new Error("Date, time, and session length are required.");

  if (hasSchedule) {
    time.date = date;
    time.time = clock;
    time.lengthMinutes = lengthMinutes;
    time.title = [date, clock, time.timezone, `${lengthMinutes} min`].filter(Boolean).join(" ");
  }
  const opening = (disableToggle && data.signupsDisabled === false) || Boolean(data.convertYesToMaybe);
  if (opening) {
    const zoneIana = await zoneIanaMap();
    const start = wallTimeToUtc(time.date, time.time, time.timezone || "Pacific", zoneIana);
    if (start && !Number.isNaN(start.getTime()) && start.getTime() <= Date.now()) {
      throw new Error("slot_in_past");
    }
  }
  if (disableToggle) time.signupsDisabled = Boolean(data.signupsDisabled);
  if (data.convertYesToMaybe) {
    time.signupsDisabled = false;
    for (const signup of session.signups || []) {
      if (signup.votes?.[timeId] === "yes") signup.votes[timeId] = "maybe";
    }
  }
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
  record.voteNotes = { ...(record.voteNotes || {}) };
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
  if (extra.timeId && extra.voteNote !== undefined) {
    const note = String(extra.voteNote || "").trim();
    if (note) record.voteNotes[extra.timeId] = note;
    else delete record.voteNotes[extra.timeId];
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
  const session = await applyPastSessionLocks(await liveAdventure());
  const locked = (session.times || []).find((item) => item.id === timeId);
  const noteOnly = data.status == null || data.status === "";
  if (locked?.signupsDisabled && !noteOnly) throw new Error("signups_disabled");
  if (noteOnly && data.voteNote !== undefined) {
    return upsertAdventureSignup(user, {
      timeId,
      voteNote: String(data.voteNote || "").trim()
    });
  }
  const status = data.status === "leave" || data.status === "yes" || data.status === "maybe" || data.status === "no"
    ? data.status
    : "in";
  return upsertAdventureSignup(user, {
    timeId,
    status,
    ...(data.voteNote !== undefined ? { voteNote: String(data.voteNote || "").trim() } : {})
  });
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
    discordUserId: user.discordUserId || "",
    redditUserId: user.redditUserId || "",
    preferredComm: user.preferredComm || "email",
    tokenColor: user.tokenColor === 0 || user.tokenColor ? user.tokenColor : "",
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
  if (isPrivateCharacterSheet(sheet)) return publicPrivateCharacter(sheet, handle);
  return {
    url: sheet.url,
    id: sheet.id,
    name: sheet.name || "",
    abc: sheet.abc || "",
    level: sheet.level ?? "",
    imageUrl: sheet.imageUrl || "",
    handle: handle || sheet.handle || "",
    inParty: sheet.inParty !== false,
    error: sheet.error || ""
  };
}

function publicPcs(adventure, users, viewerEmail = "") {
  const handles = new Map(users.map((user) => [user.email, user.handle]));
  const tokens = new Map(users.map((user) => [user.email, user.tokenColor]));
  const viewer = normalizeEmail(viewerEmail);
  const rows = [];
  for (const pack of adventure.wgSheets || []) {
    const handle = handles.get(pack.email) || "";
    const tokenColor = tokens.get(pack.email);
    for (const sheet of pack.sheets || []) {
      if (sheet.inParty === false) continue;
      const row = {
        ...publicSheet(sheet, handle),
        tokenColor: tokenColor === 0 || tokenColor ? tokenColor : ""
      };
      if (isPrivateCharacterSheet(sheet) && normalizeEmail(pack.email) !== viewer) {
        delete row.privateExportName;
      }
      rows.push(row);
    }
  }
  rows.sort((a, b) => String(a.name || a.url).localeCompare(String(b.name || b.url)));
  return rows.slice(0, partySlotCounts(adventure).maxPartyPcs);
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
  const previous = (pack.sheets || []).find((sheet) => sheet.url === replaceUrl || sheet.url === parsed.url);
  const sheets = (pack.sheets || []).filter((sheet) => sheet.url !== replaceUrl && sheet.url !== parsed.url);
  if (sheets.length >= MAX_WG_CHARACTER_OPTIONS) throw new Error("sheet_limit");
  const row = await fetchPublicCharacter(parsed.id);
  if (!row) throw new Error("not_public");
  if (!isPublicCharacter(row)) throw new Error("not_public");
  const next = summarizeCharacter(row, parsed.url);
  const inPartyCount = sheets.filter((sheet) => sheet.inParty !== false).length;
  const perPlayer = partySlotCounts(adventure).maxPcsPerPlayer;
  if (previous && previous.inParty !== false) next.inParty = true;
  else next.inParty = inPartyCount < perPlayer;
  sheets.push(next);
  pack.sheets = sheets;
  await writeAdventure(adventure);
  const users = await readJson("users");
  return { user: publicUser(user, adventure), pcs: publicPcs(adventure, users, user.email) };
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
  return { user: publicUser(user, adventure), pcs: publicPcs(adventure, users, user.email) };
}

async function excludePartyPc(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("login_required");
  const privateExportName = safeZipExportName(data.privateExportName);
  const parsed = privateExportName ? null : parseWgSheetUrl(data.url);
  if (!privateExportName && !parsed) throw new Error("bad_sheet_url");
  const adventure = await liveAdventure();
  const pack = (adventure.wgSheets || []).find((item) => item.email === user.email);
  const sheet = (pack?.sheets || []).find((item) => {
    if (privateExportName) return isPrivateCharacterSheet(item) && item.privateExportName === privateExportName;
    return item.url === parsed.url;
  });
  if (!sheet) throw new Error("not_found");
  sheet.inParty = false;
  await writeAdventure(adventure);
  const users = await readJson("users");
  return { user: publicUser(user, adventure), pcs: publicPcs(adventure, users, user.email) };
}

async function includePartyPc(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("login_required");
  const privateExportName = safeZipExportName(data.privateExportName);
  const parsed = privateExportName ? null : parseWgSheetUrl(data.url);
  if (!privateExportName && !parsed) throw new Error("bad_sheet_url");
  const adventure = await liveAdventure();
  const pack = (adventure.wgSheets || []).find((item) => item.email === user.email);
  const sheet = (pack?.sheets || []).find((item) => {
    if (privateExportName) return isPrivateCharacterSheet(item) && item.privateExportName === privateExportName;
    return item.url === parsed.url;
  });
  if (!sheet) throw new Error("not_found");
  if (sheet.inParty !== false) {
    const users = await readJson("users");
    return { user: publicUser(user, adventure), pcs: publicPcs(adventure, users, user.email) };
  }
  const slots = partySlotCounts(adventure);
  const inPartyCount = (pack.sheets || []).filter((item) => item.inParty !== false).length;
  if (inPartyCount >= slots.maxPcsPerPlayer) throw new Error("party_per_player_limit");
  sheet.inParty = true;
  await writeAdventure(adventure);
  const users = await readJson("users");
  return { user: publicUser(user, adventure), pcs: publicPcs(adventure, users, user.email) };
}

async function findOwnedWgExport(user, name) {
  const zipName = safeZipExportName(name);
  if (!zipName) throw new Error("bad_filename");
  const index = await readExportIndex();
  const record = index[zipName];
  const sessionId = await defaultAdventureId();
  if (!record || normalizeEmail(record.email) !== user.email || (record.sessionId || sessionId) !== sessionId) {
    throw new Error("forbidden");
  }
  try {
    await fs.stat(path.join(WG_EXPORT_DIR, zipName));
  } catch {
    throw new Error("not_found");
  }
  return zipName;
}

async function savePrivateCharacter(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("login_required");
  const zipName = await findOwnedWgExport(user, data.name);
  const adventure = await liveAdventure();
  if (!Array.isArray(adventure.wgSheets)) adventure.wgSheets = [];
  let pack = adventure.wgSheets.find((item) => item.email === user.email);
  if (!pack) {
    pack = { email: user.email, sheets: [] };
    adventure.wgSheets.push(pack);
  }
  ensurePrivateCharacterOption(pack, zipName, {
    allowWaitlist: true,
    maxPcsPerPlayer: partySlotCounts(adventure).maxPcsPerPlayer
  });
  await writeAdventure(adventure);
  const users = await readJson("users");
  return { user: publicUser(user, adventure), pcs: publicPcs(adventure, users, user.email) };
}

async function deletePrivateCharacter(data) {
  const user = await findUserByEmail(data.email);
  if (!user) throw new Error("login_required");
  const zipName = safeZipExportName(data.name);
  if (!zipName) throw new Error("bad_filename");
  const adventure = await liveAdventure();
  const pack = (adventure.wgSheets || []).find((item) => item.email === user.email);
  if (pack) {
    removePrivateCharacterOption(pack, zipName);
    await writeAdventure(adventure);
  }
  const users = await readJson("users");
  return { user: publicUser(user, adventure), pcs: publicPcs(adventure, users, user.email) };
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

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      out[key] = part.slice(index + 1).trim();
    }
  }
  return out;
}

function mintAdminToken() {
  const id = crypto.randomUUID();
  if (!adminPassword) return id;
  return `${id}.${crypto.createHmac("sha256", adminPassword).update(id).digest("hex")}`;
}

function isSignedAdminToken(token) {
  if (!adminPassword) return false;
  const value = String(token || "");
  const dot = value.lastIndexOf(".");
  if (dot < 1) return false;
  const id = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = crypto.createHmac("sha256", adminPassword).update(id).digest("hex");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function adminTokenFromReq(req) {
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (bearer) return bearer;
  return String(parseCookies(req)[ADMIN_COOKIE] || "").trim();
}

function adminCookieHeader(token) {
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${ADMIN_COOKIE_MAX_AGE}; SameSite=Lax`;
}

function requireAdmin(req, res) {
  const token = adminTokenFromReq(req);
  if (!token || (!adminTokens.has(token) && !isSignedAdminToken(token))) {
    sendJson(res, 401, { error: "unauthorized" });
    return false;
  }
  adminTokens.add(token);
  return true;
}

function hasAdminAccess(req) {
  const token = adminTokenFromReq(req);
  if (!token || (!adminTokens.has(token) && !isSignedAdminToken(token))) return false;
  adminTokens.add(token);
  return true;
}

function sendJson(res, status, value, extraHeaders = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...extraHeaders });
  res.end(JSON.stringify(value));
}

async function readRawBody(req, maxBytes = JSON_BODY_MAX) {
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
  return Buffer.concat(chunks).toString("utf8");
}

async function readBody(req, maxBytes = JSON_BODY_MAX) {
  const raw = await readRawBody(req, maxBytes);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function readImportBody(req) {
  const raw = await readRawBody(req, IMPORT_BODY_MAX);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function currentSnapshot() {
  return backup.buildExportSnapshot(await backup.loadRuntime(dataDir));
}

async function restoreFromPayload(raw) {
  const parsed = backup.parseSnapshot(raw);
  if (parsed.kind === "user-node") {
    const state = await backup.loadRuntime(dataDir);
    const merged = backup.mergeUserNode(state, parsed, parsed.user?.email);
    await backup.applyImport(dataDir, merged);
    return { ok: true, kind: "user-node", email: parsed.user?.email || "" };
  }
  const coerced = backup.coerceImport(raw);
  await backup.applyImport(dataDir, coerced);
  return {
    ok: true,
    kind: "full",
    users: coerced.users.length,
    adventures: coerced.adventures.length,
    feedback: coerced.feedback.length,
    questionnaireResponses: coerced.questionnaire.responses.length
  };
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
  const adventure = await liveAdventure();
  const pack = (adventure.wgSheets || []).find((item) => item.email === user.email);
  if (removePrivateCharacterOption(pack, zipName)) {
    await writeAdventure(adventure);
  }
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
    title: displayAdventureTitle(adventure.title) || adventure.title || "An AMBA Adventure",
    subtitle: String(adventure.subtitle || "").trim(),
    targetPlayers: adventure.targetPlayers,
    maxPartyPcs: partySlotCounts(adventure).maxPartyPcs,
    playPartyPcs: partySlotCounts(adventure).playPartyPcs,
    maxPcsPerPlayer: partySlotCounts(adventure).maxPcsPerPlayer,
    format: adventure.format,
    scope: adventure.scope,
    times: adventure.times || [],
    syndicationUrl: adventure.syndicationUrl || "",
    playerHookUrl: adventure.playerHookUrl || "",
    playerHookText: adventure.playerHookText || "",
    readingLinks: (Array.isArray(adventure.readingLinks) ? adventure.readingLinks : []).map(linkPreview.publicReadingLink),
    setupSource: adventure.setupSource === "manual" ? "manual" : "connect",
    ambaModuleId: adventure.ambaModuleId || adventure.id,
    displayHostedByBanner: adventure.displayHostedByBanner !== false,
    hostedByBannerHeight: hostedByBannerHeight(adventure.hostedByBannerHeight),
    discordHost: coerceDiscordHost(adventure.discordHost)
  };
}

async function writeSite(id) {
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.writeFile(siteFile, `${JSON.stringify({ defaultSessionId: safeAdventureId(id) }, null, 2)}\n`);
}

async function listAmbaModules() {
  const selectedId = await defaultAdventureId();
  const loaded = await backup.loadRuntime(dataDir);
  return {
    locked: false,
    selectedId,
    modules: loaded.adventures.map((adventure) => ({
      id: adventure.id,
      title: adventure.title || "An AMBA Adventure",
      live: adventure.id === selectedId,
      source: adventure.id === selectedId ? "live" : "archive"
    }))
  };
}

async function selectLiveAdventure(id) {
  const loaded = await backup.loadRuntime(dataDir);
  const found = loaded.adventures.find((adventure) => adventure.id === safeAdventureId(id));
  if (found) await writeSite(found.id);
  return listAmbaModules();
}

async function switchModule(body) {
  const loaded = await backup.loadRuntime(dataDir);
  const liveId = await defaultAdventureId();
  const previous = loaded.adventures.find((adventure) => adventure.id === liveId)
    || loaded.adventures[0]
    || emptyAdventure(liveId);
  const existingIds = new Set(loaded.adventures.map((adventure) => adventure.id));
  const next = provisionNewAdventure(previous, body || {}, existingIds);
  await writeAdventure(next);
  await writeSite(next.id);
  return {
    previousId: previous.id,
    adventure: publicSession(next),
    modules: await listAmbaModules()
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

async function adminUsers() {
  const users = await readJson("users");
  return users
    .map((user) => ({
      username: String(user.handle || "").trim(),
      handle: String(user.handle || "").trim(),
      timezone: String(user.timezone || "").trim(),
      email: String(user.email || "").trim(),
      discord: String(user.discord || "").trim()
    }))
    .sort((a, b) => a.handle.localeCompare(b.handle) || a.email.localeCompare(b.email));
}

async function adminYesMail() {
  const modules = await listAmbaModules();
  const links = await sessionLinks();
  return {
    emails: await yesEmails(),
    selfEmail: await adminSelfEmail(),
    slot: await leadingYesSlot(),
    modules,
    title: links.title,
    subtitle: links.subtitle,
    ambaModuleId: links.ambaModuleId,
    syndicationUrl: links.syndicationUrl,
    playerHookUrl: links.playerHookUrl,
    playerHookText: links.playerHookText,
    setupSource: links.setupSource,
    displayHostedByBanner: links.displayHostedByBanner !== false,
    hostedByBannerHeight: hostedByBannerHeight(links.hostedByBannerHeight)
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDiscordUserId(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeRedditUserId(value) {
  return String(value || "").trim().replace(/^u\//i, "");
}

function normalizePreferredComm(value) {
  const allowed = new Set(["email", "discord", "reddit"]);
  const next = String(value || "").trim().toLowerCase();
  return allowed.has(next) ? next : "email";
}

function normalizeStoredTokenColor(value) {
  if (value === "" || value == null) return "";
  const raw = String(value).trim().toLowerCase();
  if (raw === "auto") return "";
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 9) return "";
  return n;
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
