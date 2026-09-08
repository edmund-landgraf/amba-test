export function normalizeSessionEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function resolveSessionEmail(stored, search) {
  const raw = typeof search === "string"
    ? search
    : (search && typeof search.toString === "function" ? search.toString() : "");
  const query = raw.startsWith("?") || raw.includes("=") ? raw.replace(/^\?/, "") : raw;
  let fromQuery = "";
  try {
    fromQuery = new URLSearchParams(query).get("email") || "";
  } catch {
    fromQuery = "";
  }
  return normalizeSessionEmail(fromQuery) || normalizeSessionEmail(stored);
}

// Nothing here belongs in an address bar: email is only a bootstrap hint, and the
// rest can only arrive by accident (a form submitting natively when JS is broken).
// Scrub them so they stay out of history, bookmarks, referrers and shared links.
export const UNSAFE_QUERY_KEYS = ["email", "password", "token", "adminToken", "secret", "key"];

export function strippedSessionUrl(href) {
  const url = new URL(href);
  const found = UNSAFE_QUERY_KEYS.filter((key) => url.searchParams.has(key));
  if (!found.length) return "";
  for (const key of found) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}
