"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const local = require("./handle-local-words");

const HANDLE_PART_WINDOW = local.HANDLE_PART_WINDOW;
const CACHE_PATH = path.join(__dirname, "..", "data", "runtime", "handle-datamuse.json");
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const DATAMUSE = "https://api.datamuse.com/words";

const STOP = new Set(`
  other said over same into with from this that they have were been will would
  could should about after before under without within while where which their
  there these those being both each more most some such than then them very just
  also only even still back well much many good great large small high long last
  next different possible important public social political national something
  everything anything someone anyone yourself himself herself itself whatever
  another every never always often quite rather almost already enough
`.trim().split(/\s+/));

const BLOCK = new Set(`
  rape raper rapist nigger faggot retard retarded slut whore bitch damn shit
  piss penis vagina semen anal rectal rectal nude naked porn sexual sexy
  suicide murder kill killer death dead bloody bloody rape
`.trim().split(/\s+/));

const POS_KEYS = ["adj", "n", "adv", "v"];

const pools = { adj: [], n: [], adv: [], v: [] };
let loaded = false;
let loadPromise = null;

function titleCase(word) {
  const clean = String(word || "").replace(/[^a-z0-9]+/gi, "");
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

function freq(tags) {
  const hit = (tags || []).find((tag) => String(tag).startsWith("f:"));
  return hit ? Number(String(hit).slice(2)) : 0;
}

function primaryPos(tags) {
  return (tags || []).find((tag) => POS_KEYS.includes(tag)) || "";
}

function usable(row, pos, opts = {}) {
  const word = String(row.word || "").toLowerCase();
  const tags = row.tags || [];
  if (!/^[a-z]+$/.test(word)) return false;
  const minLen = pos === "n" ? 5 : 4;
  if (word.length < minLen || word.length > 12) return false;
  if (STOP.has(word) || BLOCK.has(word)) return false;
  if (tags.includes("prop")) return false;
  if (primaryPos(tags) !== pos) return false;
  const f = freq(tags);
  if (!Number.isFinite(f)) return false;
  const minF = opts.minF ?? (pos === "n" ? 0.5 : 0.8);
  const maxF = opts.maxF ?? 35;
  if (f < minF || f > maxF) return false;
  const syllables = Number(row.numSyllables);
  if (Number.isFinite(syllables) && (syllables < 1 || syllables > 4)) return false;
  if (pos === "adj" && (word.endsWith("ed") || word.endsWith("ing"))) return false;
  if (pos === "n" && (word.endsWith("ing") || word.endsWith("ness") || word.endsWith("tion") || word.endsWith("sion") || word.endsWith("ment"))) {
    return false;
  }
  if (pos === "n" && /s$/.test(word) && !/(ss|us|is|os|as)$/.test(word)) return false;
  if (pos === "v" && (word.endsWith("ed") || word.endsWith("ing") || /s$/.test(word))) return false;
  if (pos === "adv" && !word.endsWith("ly") && !["fast", "slow", "soon", "hard", "late", "near", "wide"].includes(word)) {
    return false;
  }
  return true;
}

function queryUrl(params) {
  const url = new URL(DATAMUSE);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  url.searchParams.set("md", "pfs");
  url.searchParams.set("max", "1000");
  return url.toString();
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Datamuse ${res.status} for ${url}`);
  return res.json();
}

async function mapPool(items, worker, limit = 6) {
  const out = [];
  let i = 0;
  async function next() {
    while (i < items.length) {
      const cur = i;
      i += 1;
      out[cur] = await worker(items[cur]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return out;
}

function letterQueries() {
  return "abcdefghijklmnopqrstuvwxyz".split("").map((letter) => ({ sp: `${letter}*` }));
}

function flavorQueries() {
  return [
    { ml: "clever" },
    { ml: "brave" },
    { ml: "whimsical" },
    { ml: "ambitious" },
    { ml: "quiet" },
    { rel_jjb: "hero" },
    { rel_jjb: "creature" },
    { ml: "animal" },
    { ml: "bird" },
    { ml: "forest" },
    { ml: "ocean" },
    { ml: "star" },
    { ml: "myth" },
    { ml: "hamster" },
    { ml: "asteroid" },
    { ml: "quickly" },
    { ml: "walk" },
    { sp: "*ly" }
  ];
}

function ingest(rows, buckets, opts) {
  for (const row of rows || []) {
    const tags = row.tags || [];
    const pos = primaryPos(tags);
    if (!buckets[pos]) continue;
    if (!usable(row, pos, opts)) continue;
    buckets[pos].add(titleCase(row.word));
  }
}

async function fetchPools() {
  const buckets = { adj: new Set(), n: new Set(), adv: new Set(), v: new Set() };
  await mapPool(letterQueries(), async (params) => {
    ingest(await fetchJson(queryUrl(params)), buckets, { minF: 1.1, maxF: 32 });
  });
  await mapPool(flavorQueries(), async (params) => {
    ingest(await fetchJson(queryUrl(params)), buckets, { minF: 0.05, maxF: 40 });
  });
  const next = {};
  for (const pos of POS_KEYS) {
    next[pos] = [...buckets[pos]].sort((a, b) => a.localeCompare(b));
  }
  if (next.adj.length < HANDLE_PART_WINDOW + 48 || next.n.length < HANDLE_PART_WINDOW + 48) {
    throw new Error(`Datamuse handle pools too small (adj ${next.adj.length}, n ${next.n.length})`);
  }
  return next;
}

async function readCache() {
  try {
    const raw = JSON.parse(await fs.readFile(CACHE_PATH, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    if (Date.now() - Number(raw.fetchedAt || 0) > CACHE_MS) return null;
    for (const pos of POS_KEYS) {
      if (!Array.isArray(raw[pos]) || raw[pos].length < 50) return null;
    }
    if (raw.adj.length < HANDLE_PART_WINDOW || raw.n.length < HANDLE_PART_WINDOW) return null;
    return raw;
  } catch {
    return null;
  }
}

async function writeCache(next) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify({ fetchedAt: Date.now(), ...next }));
}

function applyPools(next) {
  for (const pos of POS_KEYS) pools[pos] = next[pos].slice();
  loaded = true;
  return pools;
}

function wordsFor(pos, source = "list") {
  if (normalizeSource(source) === "datamuse") {
    if (pos === "noun") return pools.n;
    if (pos === "verb") return pools.v;
    if (pos === "adjective") return pools.adj;
    if (pos === "adverb") return pools.adv;
    return pools[pos] || [];
  }
  if (pos === "adj" || pos === "adjective") return local.adjectives;
  if (pos === "adv" || pos === "adverb") return local.adverbs;
  if (pos === "v" || pos === "verb") return local.verbs;
  return local.nouns;
}

function normalizeSource(value) {
  return String(value || "").toLowerCase() === "datamuse" ? "datamuse" : "list";
}

async function ensurePools(source = "list") {
  if (normalizeSource(source) !== "datamuse") {
    return {
      adj: local.adjectives,
      n: local.nouns,
      adv: local.adverbs,
      v: local.verbs
    };
  }
  if (loaded && pools.adj.length) return pools;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const cached = await readCache();
    if (cached) return applyPools(cached);
    const fresh = await fetchPools();
    await writeCache(fresh);
    return applyPools(fresh);
  })();
  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

module.exports = {
  HANDLE_PART_WINDOW,
  DATAMUSE,
  normalizeSource,
  ensurePools,
  wordsFor,
  get adjectives() { return local.adjectives; },
  get nouns() { return local.nouns; },
  get adverbs() { return local.adverbs; },
  get verbs() { return local.verbs; },
  local
};
