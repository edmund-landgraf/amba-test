const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  FALLBACK_ADVENTURE_ID,
  emptyAdventure,
  safeAdventureId,
  mergePromote
} = require("./adventure-defaults");
const { coerceDiscordHost } = require("./discord-hosts");
const questionnaire = require("./questionnaire");

const VOTE_OK = new Set(["yes", "maybe", "no", "in"]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

function backupFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `amba-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.json`;
}

function isBackupFileName(name) {
  return /^amba-backup-\d{4}-\d{2}-\d{2}-\d{6}\.json$/.test(String(name || ""));
}

function parseSnapshot(raw) {
  if (raw && typeof raw === "object") return asObject(raw);
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return asObject(parsed);
  } catch {
    return {};
  }
}

function coerceVotes(votes, timeIds) {
  const allowed = new Set(timeIds);
  const out = {};
  for (const [key, value] of Object.entries(asObject(votes))) {
    if (!allowed.has(key)) continue;
    if (VOTE_OK.has(value)) out[key] = value;
  }
  return out;
}

function coerceVoteNotes(notes) {
  const out = {};
  for (const [key, value] of Object.entries(asObject(notes))) {
    const note = String(value || "").trim();
    if (note) out[key] = note;
  }
  return out;
}

function coerceTime(item) {
  const time = asObject(item);
  const id = String(time.id || crypto.randomUUID());
  return {
    ...time,
    id,
    title: String(time.title || "").trim(),
    date: String(time.date || "").trim(),
    time: String(time.time || "").trim(),
    timezone: String(time.timezone || "").trim(),
    lengthMinutes: time.lengthMinutes == null || time.lengthMinutes === ""
      ? null
      : Number(time.lengthMinutes) || null,
    note: String(time.note || "").trim(),
    signupsDisabled: Boolean(time.signupsDisabled),
    createdBy: normalizeEmail(time.createdBy),
    createdAt: String(time.createdAt || "")
  };
}

function coerceSignup(item, timeIds, usedHandles) {
  const signup = asObject(item);
  const email = normalizeEmail(signup.email);
  if (!email) return null;
  let handle = normalizeHandle(signup.handle);
  if (!handle) {
    handle = `Guest-${crypto.randomUUID().slice(0, 8)}`;
  }
  usedHandles.add(handle);
  const votes = coerceVotes(signup.votes, timeIds);
  return {
    ...signup,
    id: String(signup.id || crypto.randomUUID()),
    email,
    handle,
    discord: String(signup.discord || ""),
    timezone: String(signup.timezone || ""),
    role: String(signup.role || ""),
    characterStatus: String(signup.characterStatus || ""),
    votes,
    voteNotes: coerceVoteNotes(signup.voteNotes),
    notes: String(signup.notes || ""),
    createdAt: String(signup.createdAt || ""),
    updatedAt: String(signup.updatedAt || "")
  };
}

function coerceUser(item, usedHandles) {
  const user = asObject(item);
  const { slotsAdded, occupancy, wgSheets, ...rest } = user;
  const email = normalizeEmail(rest.email);
  if (!email) return null;
  let handle = normalizeHandle(rest.handle);
  if (!handle || usedHandles.has(handle)) {
    handle = `User-${crypto.randomUUID().slice(0, 8)}`;
  }
  usedHandles.add(handle);
  return {
    ...rest,
    id: String(rest.id || crypto.randomUUID()),
    email,
    handle,
    discord: String(rest.discord || ""),
    discordUserId: String(rest.discordUserId || ""),
    redditUserId: String(rest.redditUserId || ""),
    timezone: String(rest.timezone || ""),
    characterStatus: String(rest.characterStatus || ""),
    role: String(rest.role || ""),
    createdAt: String(rest.createdAt || ""),
    updatedAt: String(rest.updatedAt || "")
  };
}

function coerceReadingLink(item) {
  const raw = asObject(item);
  const url = String(raw.url || "").trim();
  if (!url) return null;
  return {
    id: String(raw.id || crypto.randomUUID()),
    url,
    kind: raw.kind === "syndication" ? "syndication" : "web",
    title: String(raw.title || ""),
    description: String(raw.description || ""),
    image: String(raw.image || ""),
    siteName: String(raw.siteName || ""),
    artifactType: raw.artifactType === "pdf" ? "pdf" : "handout",
    fetchedAt: String(raw.fetchedAt || ""),
    fetchError: String(raw.fetchError || "")
  };
}

function coerceAdventure(item) {
  const raw = asObject(item);
  const id = safeAdventureId(raw.id);
  const base = emptyAdventure(id);
  const times = asArray(raw.times).map(coerceTime);
  const timeIds = times.map((time) => time.id);
  const usedHandles = new Set();
  const signups = asArray(raw.signups)
    .map((signup) => coerceSignup(signup, timeIds, usedHandles))
    .filter(Boolean);
  const discordHost = coerceDiscordHost(raw.discordHost);
  return {
    ...base,
    ...raw,
    id,
    title: String(raw.title || base.title),
    subtitle: String(raw.subtitle || ""),
    targetPlayers: Number(raw.targetPlayers) || base.targetPlayers,
    maxPartyPcs: Number(raw.maxPartyPcs) || base.maxPartyPcs,
    playPartyPcs: Number(raw.playPartyPcs) || base.playPartyPcs,
    maxPcsPerPlayer: Number(raw.maxPcsPerPlayer) || base.maxPcsPerPlayer,
    format: String(raw.format || base.format),
    scope: String(raw.scope || base.scope),
    times,
    syndicationUrl: String(raw.syndicationUrl || ""),
    playerHookUrl: String(raw.playerHookUrl || ""),
    playerHookText: String(raw.playerHookText || ""),
    readingLinks: asArray(raw.readingLinks).map(coerceReadingLink).filter(Boolean),
    setupSource: raw.setupSource === "manual" || raw.setupSource === "manualAmba" ? raw.setupSource : "connect",
    ambaModuleId: String(raw.ambaModuleId || id),
    adminPasswordHash: raw.adminPasswordHash == null ? null : raw.adminPasswordHash,
    signups,
    wgSheets: asArray(raw.wgSheets),
    promote: mergePromote(raw.promote),
    ...(discordHost ? { discordHost } : { discordHost: undefined })
  };
}

function coerceImport(raw) {
  const data = parseSnapshot(raw);
  const usedHandles = new Set();
  const users = asArray(data.users).map((user) => coerceUser(user, usedHandles)).filter(Boolean);
  const adventures = asArray(data.adventures).map(coerceAdventure);
  const fallbackId = adventures[0]?.id || FALLBACK_ADVENTURE_ID;
  const siteRaw = asObject(data.site);
  const site = {
    ...siteRaw,
    defaultSessionId: safeAdventureId(siteRaw.defaultSessionId || fallbackId)
  };
  const feedback = asArray(data.feedback).map((item) => {
    const row = asObject(item);
    return {
      ...row,
      id: String(row.id || crypto.randomUUID()),
      email: normalizeEmail(row.email),
      handle: String(row.handle || "Anonymous"),
      topic: String(row.topic || "Other"),
      message: String(row.message || ""),
      createdAt: String(row.createdAt || "")
    };
  });
  return {
    site,
    users,
    adventures,
    feedback,
    wgExportIndex: asObject(data.wgExportIndex),
    questionnaire: questionnaire.coerceQuestionnaire(data.questionnaire)
  };
}

function slotsAddedForUsers(users, adventures) {
  const byEmail = new Map();
  for (const adventure of adventures) {
    for (const time of adventure.times || []) {
      const email = normalizeEmail(time.createdBy);
      if (!email) continue;
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push(time.id);
    }
  }
  return users.map((user) => ({
    ...user,
    slotsAdded: byEmail.get(normalizeEmail(user.email)) || []
  }));
}

function occupancyFromAdventures(adventures) {
  const rows = [];
  for (const adventure of adventures) {
    for (const time of adventure.times || []) {
      const people = [];
      for (const signup of adventure.signups || []) {
        const status = signup.votes?.[time.id];
        if (!status) continue;
        people.push({
          email: signup.email,
          handle: signup.handle,
          status: status === "in" ? "" : status,
          note: String(signup.voteNotes?.[time.id] || "")
        });
      }
      rows.push({
        adventureTitle: adventureTitle(adventure),
        timeId: time.id,
        title: time.title || "",
        people
      });
    }
  }
  return rows;
}

function buildExportSnapshot({
  site,
  users,
  adventures,
  feedback,
  wgExportIndex,
  questionnaire: questionnaireData,
  exportedAt = new Date().toISOString()
}) {
  const userList = asArray(users);
  const adventureList = asArray(adventures);
  return {
    version: 1,
    exportedAt,
    site: asObject(site),
    users: slotsAddedForUsers(userList, adventureList),
    adventures: adventureList,
    occupancy: occupancyFromAdventures(adventureList),
    feedback: asArray(feedback),
    wgExportIndex: asObject(wgExportIndex),
    questionnaire: questionnaire.coerceQuestionnaire(questionnaireData)
  };
}

function canonicalRuntime(state) {
  const stripUser = ({ slotsAdded, occupancy, ...user }) => user;
  return JSON.parse(JSON.stringify({
    site: state.site,
    users: asArray(state.users).map(stripUser),
    adventures: asArray(state.adventures),
    feedback: asArray(state.feedback),
    wgExportIndex: asObject(state.wgExportIndex),
    questionnaire: questionnaire.coerceQuestionnaire(state.questionnaire)
  }));
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return structuredClone(fallback);
    throw error;
  }
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function pathsFor(rootDir) {
  const runtimeDir = path.join(rootDir, "runtime");
  return {
    runtimeDir,
    adventuresDir: path.join(runtimeDir, "adventures"),
    backupsDir: path.join(runtimeDir, "backups"),
    siteFile: path.join(runtimeDir, "site.json"),
    usersFile: path.join(runtimeDir, "users.json"),
    feedbackFile: path.join(runtimeDir, "feedback.json"),
    questionnaireFile: path.join(runtimeDir, "questionnaire.json"),
    wgIndexFile: path.join(rootDir, "wg-exports-index.json")
  };
}

async function loadRuntime(rootDir) {
  const p = pathsFor(rootDir);
  const site = await readJsonFile(p.siteFile, { defaultSessionId: FALLBACK_ADVENTURE_ID });
  const users = await readJsonFile(p.usersFile, []);
  const feedback = await readJsonFile(p.feedbackFile, []);
  const questionnaireData = questionnaire.coerceQuestionnaire(
    await readJsonFile(p.questionnaireFile, questionnaire.defaultQuestionnaire)
  );
  const wgExportIndex = await readJsonFile(p.wgIndexFile, {});
  let names = [];
  try {
    names = (await fs.readdir(p.adventuresDir)).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const adventures = [];
  for (const name of names) {
    const data = await readJsonFile(path.join(p.adventuresDir, name), null);
    if (data) adventures.push({ ...emptyAdventure(safeAdventureId(data.id || name)), ...data });
  }
  return { site, users, adventures, feedback, questionnaire: questionnaireData, wgExportIndex };
}

async function applyImport(rootDir, coerced) {
  const p = pathsFor(rootDir);
  await fs.mkdir(p.adventuresDir, { recursive: true });
  await writeJsonFile(p.siteFile, coerced.site);
  await writeJsonFile(p.usersFile, coerced.users);
  await writeJsonFile(p.feedbackFile, coerced.feedback);
  await writeJsonFile(p.questionnaireFile, questionnaire.coerceQuestionnaire(coerced.questionnaire));
  await writeJsonFile(p.wgIndexFile, coerced.wgExportIndex);
  let existing = [];
  try {
    existing = (await fs.readdir(p.adventuresDir)).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const keep = new Set(coerced.adventures.map((adventure) => `${safeAdventureId(adventure.id)}.json`));
  for (const name of existing) {
    if (!keep.has(name)) await fs.unlink(path.join(p.adventuresDir, name));
  }
  for (const adventure of coerced.adventures) {
    await writeJsonFile(path.join(p.adventuresDir, `${safeAdventureId(adventure.id)}.json`), adventure);
  }
}

async function writeBackupFile(rootDir, snapshot, when = new Date()) {
  const p = pathsFor(rootDir);
  await fs.mkdir(p.backupsDir, { recursive: true });
  let name = backupFileName(when);
  let dest = path.join(p.backupsDir, name);
  let n = 0;
  while (fsSync.existsSync(dest)) {
    n += 1;
    name = backupFileName(new Date(when.getTime() + n * 1000));
    dest = path.join(p.backupsDir, name);
  }
  const body = `${JSON.stringify(snapshot, null, 2)}\n`;
  await fs.writeFile(dest, body);
  return { name, exportedAt: snapshot.exportedAt, bytes: Buffer.byteLength(body) };
}

async function listBackups(rootDir) {
  const p = pathsFor(rootDir);
  let names = [];
  try {
    names = (await fs.readdir(p.backupsDir)).filter(isBackupFileName);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const backups = [];
  for (const name of names) {
    const filePath = path.join(p.backupsDir, name);
    const stat = await fs.stat(filePath);
    let exportedAt = "";
    try {
      exportedAt = JSON.parse(await fs.readFile(filePath, "utf8")).exportedAt || "";
    } catch {
      exportedAt = "";
    }
    backups.push({
      name,
      exportedAt: exportedAt || stat.mtime.toISOString(),
      bytes: stat.size
    });
  }
  backups.sort((a, b) => String(b.exportedAt).localeCompare(String(a.exportedAt)) || b.name.localeCompare(a.name));
  return backups;
}

function backupPath(rootDir, name) {
  if (!isBackupFileName(name)) return null;
  return path.join(pathsFor(rootDir).backupsDir, name);
}

function userExportFileName(handle, date = new Date()) {
  const safe = normalizeHandle(handle) || "user";
  return `amba-user-${safe}-${backupFileName(date).replace(/^amba-backup-/, "")}`;
}

function adventureTitle(adventure) {
  return String(adventure?.title || "").trim() || "An AMBA Adventure";
}

function buildUserNode(state, email, exportedAt = new Date().toISOString()) {
  const normalized = normalizeEmail(email);
  const found = asArray(state.users).find((user) => normalizeEmail(user.email) === normalized);
  const user = found ? { ...found } : { email: normalized, handle: "" };
  const slotsAdded = [];
  const occupancy = [];
  const adventures = [];
  const questionnaireResponse = questionnaire.responseForUser(state.questionnaire, normalized);
  for (const adventure of asArray(state.adventures)) {
    const title = adventureTitle(adventure);
    const timesAdded = asArray(adventure.times).filter((time) => normalizeEmail(time.createdBy) === normalized);
    for (const time of timesAdded) slotsAdded.push({ adventureTitle: title, ...time });
    const signup = asArray(adventure.signups).find((item) => normalizeEmail(item.email) === normalized) || null;
    for (const time of asArray(adventure.times)) {
      const status = signup?.votes?.[time.id];
      if (!status) continue;
      occupancy.push({
        adventureTitle: title,
        timeId: time.id,
        title: time.title || "",
        status: status === "in" ? "" : status,
        note: String(signup?.voteNotes?.[time.id] || "")
      });
    }
    const pack = asArray(adventure.wgSheets).find((item) => normalizeEmail(item.email) === normalized);
    adventures.push({
      id: adventure.id,
      title,
      timesAdded,
      signup,
      wgSheets: pack?.sheets || []
    });
  }
  user.slotsAdded = slotsAdded.map((time) => time.id);
  return {
    version: 1,
    kind: "user-node",
    exportedAt,
    user,
    slotsAdded,
    occupancy,
    adventures,
    feedback: asArray(state.feedback).filter((item) => normalizeEmail(item.email) === normalized),
    questionnaireResponse
  };
}

function coerceUserNode(raw, email) {
  const data = parseSnapshot(raw);
  if (data.kind !== "user-node" && Array.isArray(data.users)) {
    return buildUserNode(coerceImport(data), email || data.user?.email);
  }
  const usedHandles = new Set();
  const normalized = normalizeEmail(email || data.user?.email || data.email);
  const user = coerceUser({ ...asObject(data.user), email: normalized || asObject(data.user).email }, usedHandles)
    || { email: normalized, handle: "", id: crypto.randomUUID() };
  if (normalized) user.email = normalized;
  const slotsAdded = asArray(data.slotsAdded).map((item) => {
    const time = coerceTime(item);
    const row = asObject(item);
    return {
      ...time,
      adventureTitle: String(row.adventureTitle || row.adventureId || "").trim()
    };
  });
  const occupancy = asArray(data.occupancy).map((item) => {
    const row = asObject(item);
    return {
      adventureTitle: String(row.adventureTitle || row.adventureId || "").trim(),
      timeId: String(row.timeId || ""),
      title: String(row.title || ""),
      status: VOTE_OK.has(row.status) || row.status === "" ? row.status : "",
      note: String(row.note || "")
    };
  });
  const adventures = asArray(data.adventures).map((item) => {
    const row = asObject(item);
    const timesAdded = asArray(row.timesAdded).map(coerceTime);
    return {
      id: String(row.id || ""),
      title: String(row.title || row.adventureTitle || "").trim(),
      timesAdded,
      signup: row.signup
        ? coerceSignup({ ...asObject(row.signup), email: user.email }, timesAdded.map((time) => time.id), new Set())
        : null,
      wgSheets: asArray(row.wgSheets)
    };
  });
  return {
    version: 1,
    kind: "user-node",
    exportedAt: String(data.exportedAt || ""),
    user,
    slotsAdded,
    occupancy,
    adventures,
    feedback: asArray(data.feedback).map((item) => {
      const row = asObject(item);
      return {
        ...row,
        id: String(row.id || crypto.randomUUID()),
        email: user.email,
        handle: String(row.handle || user.handle || "Anonymous"),
        topic: String(row.topic || "Other"),
        message: String(row.message || ""),
        createdAt: String(row.createdAt || "")
      };
    }),
    questionnaireResponse: questionnaire.responseForUser(
      { responses: [data.questionnaireResponse] },
      user.email
    )
  };
}

function mergeUserNode(state, raw, email) {
  const node = coerceUserNode(raw, email);
  const target = normalizeEmail(node.user.email);
  if (!target) return state;
  const { slotsAdded, ...userRow } = node.user;
  const users = asArray(state.users).filter((user) => normalizeEmail(user.email) !== target);
  users.push(userRow);
  const live = asArray(state.adventures).map((adventure) => ({ ...adventure }));
  for (const slice of node.adventures) {
    const adventure = live.find((item) => item.id === slice.id)
      || live.find((item) => adventureTitle(item).toLowerCase() === String(slice.title || slice.id || "").trim().toLowerCase())
      || (live.length === 1 ? live[0] : null);
    if (!adventure) continue;
    const keptTimes = asArray(adventure.times).filter((time) => normalizeEmail(time.createdBy) !== target);
    const incoming = asArray(slice.timesAdded).map((time) => ({ ...time, createdBy: target }));
    adventure.times = [...keptTimes, ...incoming];
    adventure.signups = asArray(adventure.signups).filter((item) => normalizeEmail(item.email) !== target);
    if (slice.signup) adventure.signups.push({ ...slice.signup, email: target, handle: userRow.handle });
    adventure.wgSheets = asArray(adventure.wgSheets).filter((item) => normalizeEmail(item.email) !== target);
    if (slice.wgSheets.length) adventure.wgSheets.push({ email: target, sheets: slice.wgSheets });
  }
  return {
    ...state,
    users,
    adventures: live,
    feedback: asArray(state.feedback).filter((item) => normalizeEmail(item.email) !== target).concat(node.feedback),
    questionnaire: node.questionnaireResponse
      ? questionnaire.mergeUserResponse(state.questionnaire, node.questionnaireResponse)
      : questionnaire.coerceQuestionnaire(state.questionnaire)
  };
}

module.exports = {
  backupFileName,
  userExportFileName,
  isBackupFileName,
  parseSnapshot,
  coerceImport,
  coerceUserNode,
  buildExportSnapshot,
  buildUserNode,
  mergeUserNode,
  canonicalRuntime,
  loadRuntime,
  applyImport,
  writeBackupFile,
  listBackups,
  backupPath,
  pathsFor
};
