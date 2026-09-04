export const TOKEN_PALETTE_SIZE = 10;

const VOTE_STATUSES = ["yes", "maybe", "no"];

function normalizeHandle(value) {
  return String(value || "").trim();
}

export function normalizeTokenColor(value) {
  if (value === "" || value == null) return null;
  const raw = String(value).trim().toLowerCase();
  if (raw === "auto") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n >= TOKEN_PALETTE_SIZE) return null;
  return n;
}

export function assignTokenColors(handles, preferences = {}) {
  const map = Object.create(null);
  const used = new Set();
  const list = [];
  for (const raw of handles || []) {
    const handle = normalizeHandle(raw);
    if (!handle || list.includes(handle)) continue;
    list.push(handle);
  }
  function lowestFree() {
    let index = 0;
    while (used.has(index)) index += 1;
    return index;
  }
  for (const handle of list) {
    const pref = normalizeTokenColor(preferences[handle]);
    if (pref == null || used.has(pref)) continue;
    map[handle] = pref;
    used.add(pref);
  }
  for (const handle of list) {
    if (map[handle] != null) continue;
    const index = lowestFree();
    map[handle] = index;
    used.add(index);
  }
  return map;
}

export function collectTokenPreferences({ times, pcs, selfHandle, selfTokenColor } = {}) {
  const prefs = Object.create(null);
  function add(handle, color) {
    const key = normalizeHandle(handle);
    const index = normalizeTokenColor(color);
    if (!key || index == null || prefs[key] != null) return;
    prefs[key] = index;
  }
  for (const time of times || []) {
    for (const person of time.participants || []) add(person.handle, person.tokenColor);
  }
  for (const pc of pcs || []) add(pc.handle, pc.tokenColor);
  add(selfHandle, selfTokenColor);
  return prefs;
}

export function handlesFromSessionTimes(times) {
  const list = Array.isArray(times) ? times.slice() : [];
  list.sort((a, b) => {
    const left = `${a.date || ""}T${a.time || "00:00"}`;
    const right = `${b.date || ""}T${b.time || "00:00"}`;
    const byWhen = left.localeCompare(right);
    if (byWhen) return byWhen;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  const handles = [];
  for (const time of list) {
    const people = time.participants || [];
    for (const status of VOTE_STATUSES) {
      for (const person of people) {
        if (person.status === status) handles.push(person.handle);
      }
    }
  }
  return handles;
}

export function handlesFromScheduleRows(rows) {
  const handles = [];
  for (const row of rows || []) {
    for (const status of VOTE_STATUSES) {
      for (const person of row[status] || []) {
        handles.push(person.handle);
      }
    }
  }
  return handles;
}

export function collectPageHandles({ times, rows, pcs, selfHandle } = {}) {
  const fromGrid = rows
    ? handlesFromScheduleRows(rows)
    : handlesFromSessionTimes(times);
  const fromPcs = (pcs || []).map((pc) => pc.handle);
  const handles = [...fromGrid, ...fromPcs];
  if (selfHandle) handles.push(selfHandle);
  return handles;
}

export function tokenIndexFor(map, handle, fallback = 0) {
  const key = normalizeHandle(handle);
  if (!key || !map || map[key] == null) return fallback;
  return map[key];
}

export function overflowTokenStyle(index) {
  if (index < TOKEN_PALETTE_SIZE) return null;
  const hue = Math.round((index * 137.508) % 360);
  return { background: `hsl(${hue} 48% 32%)`, color: "#fff" };
}

export function applyTokenEl(el, index) {
  if (!el) return;
  const token = Number.isFinite(index) ? index : 0;
  el.dataset.token = String(token);
  const extra = overflowTokenStyle(token);
  if (extra) {
    el.style.background = extra.background;
    el.style.color = extra.color;
  } else {
    el.style.background = "";
    el.style.color = "";
  }
}
