"use strict";

const crypto = require("node:crypto");
const { HANDLE_PART_WINDOW, adjectives, nouns } = require("./handle-words");

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

function emptyKeylist() {
  return {
    rotation: 0,
    window: HANDLE_PART_WINDOW,
    entries: []
  };
}

function coerceKeylist(raw) {
  const data = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const list = emptyKeylist();
  list.rotation = Number.isInteger(data.rotation) && data.rotation >= 0 ? data.rotation : 0;
  list.window = HANDLE_PART_WINDOW;
  list.entries = Array.isArray(data.entries)
    ? data.entries.map(coerceEntry).filter(Boolean)
    : [];
  pruneKeylist(list);
  return list;
}

function coerceEntry(raw) {
  const row = raw && typeof raw === "object" ? raw : {};
  const handle = normalizeHandle(row.handle);
  const parts = splitHandle(handle) || {
    adjective: normalizeHandle(row.adjective),
    noun: normalizeHandle(row.noun)
  };
  if (!handle || !parts.adjective || !parts.noun) return null;
  const rotation = Number(row.rotation);
  return {
    rotation: Number.isInteger(rotation) && rotation >= 0 ? rotation : 0,
    handle,
    adjective: parts.adjective,
    noun: parts.noun
  };
}

function splitHandle(handle) {
  const parts = normalizeHandle(handle).split("-").filter((part) => !/^\d+$/.test(part));
  if (parts.length < 2) return null;
  return { adjective: parts[0], noun: parts[1] };
}

function pruneKeylist(keylist) {
  const minRotation = keylist.rotation - keylist.window + 1;
  keylist.entries = (keylist.entries || []).filter((entry) => entry.rotation >= minRotation);
  return keylist;
}

function partsInWindow(keylist) {
  pruneKeylist(keylist);
  const adjectivesUsed = new Set();
  const nounsUsed = new Set();
  const handles = new Set();
  for (const entry of keylist.entries) {
    adjectivesUsed.add(entry.adjective.toLowerCase());
    nounsUsed.add(entry.noun.toLowerCase());
    handles.add(entry.handle.toLowerCase());
  }
  return { adjectives: adjectivesUsed, nouns: nounsUsed, handles };
}

function pick(items) {
  if (!items.length) return "";
  return items[crypto.randomInt(0, items.length)];
}

function freeWords(list, blocked) {
  return list.filter((word) => !blocked.has(word.toLowerCase()));
}

function oldestPart(keylist, kind) {
  let oldest = null;
  for (const entry of keylist.entries) {
    const word = kind === "adjective" ? entry.adjective : entry.noun;
    if (!oldest || entry.rotation < oldest.rotation) oldest = { word, rotation: entry.rotation };
  }
  return oldest?.word || "";
}

function createHandle(keylist, users, extra = {}) {
  const blocked = partsInWindow(keylist);
  const takenHandles = new Set([
    ...(users || []).map((user) => normalizeHandle(user.handle).toLowerCase()),
    ...(extra.handles || [])
  ].filter(Boolean));
  const usedAdj = new Set([...blocked.adjectives, ...(extra.adjectives || [])]);
  const usedNoun = new Set([...blocked.nouns, ...(extra.nouns || [])]);

  for (let i = 0; i < 200; i += 1) {
    const freeAdj = freeWords(adjectives, usedAdj);
    const freeNoun = freeWords(nouns, usedNoun);
    const adjective = pick(freeAdj.length ? freeAdj : adjectives);
    const noun = pick(freeNoun.length ? freeNoun : nouns);
    if (!adjective || !noun) continue;
    const handle = `${adjective}-${noun}`;
    if (takenHandles.has(handle.toLowerCase())) continue;
    if (usedAdj.has(adjective.toLowerCase()) || usedNoun.has(noun.toLowerCase())) continue;
    return handle;
  }

  const adjective = pick(freeWords(adjectives, usedAdj)) || oldestPart(keylist, "adjective") || pick(adjectives);
  const noun = pick(freeWords(nouns, usedNoun)) || oldestPart(keylist, "noun") || pick(nouns);
  return `${adjective}-${noun}-${crypto.randomInt(100, 999)}`;
}

function createHandles(keylist, users, count = 4) {
  const batch = [];
  const extra = {
    handles: [],
    adjectives: new Set(),
    nouns: new Set()
  };
  for (let i = 0; i < count; i += 1) {
    const handle = createHandle(keylist, users, extra);
    const parts = splitHandle(handle);
    batch.push(handle);
    extra.handles.push(handle.toLowerCase());
    if (parts) {
      extra.adjectives.add(parts.adjective.toLowerCase());
      extra.nouns.add(parts.noun.toLowerCase());
    }
  }
  return batch;
}

function recordHandle(keylist, handle) {
  const normalized = normalizeHandle(handle);
  const parts = splitHandle(normalized);
  if (!parts) return keylist;
  keylist.rotation += 1;
  keylist.entries.push({
    rotation: keylist.rotation,
    handle: normalized,
    adjective: parts.adjective,
    noun: parts.noun
  });
  pruneKeylist(keylist);
  return keylist;
}

function seedFromUsers(keylist, users) {
  const known = new Set((keylist.entries || []).map((entry) => entry.handle.toLowerCase()));
  const ordered = [...(users || [])].sort((left, right) => (
    String(left.createdAt || "").localeCompare(String(right.createdAt || ""))
    || String(left.handle || "").localeCompare(String(right.handle || ""))
  ));
  for (const user of ordered) {
    const handle = normalizeHandle(user.handle);
    if (!handle || known.has(handle.toLowerCase())) continue;
    recordHandle(keylist, handle);
    known.add(handle.toLowerCase());
  }
  return keylist;
}

module.exports = {
  HANDLE_PART_WINDOW,
  adjectives,
  nouns,
  normalizeHandle,
  emptyKeylist,
  coerceKeylist,
  splitHandle,
  partsInWindow,
  createHandle,
  createHandles,
  recordHandle,
  seedFromUsers,
  pruneKeylist
};
