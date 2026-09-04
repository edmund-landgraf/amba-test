const { isArtifactTitle, moduleTitleFromSyndication, displayAdventureTitle } = require("./adventure-title");

const HTML_CAP = 1_500_000;
const DESC_MAX = 220;

function isSyndicationUrl(url) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path.includes("/syndicate/") || /\/(p|n)\/[0-9a-f-]{36}\/?$/i.test(path);
  } catch {
    return false;
  }
}

function hostTitle(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return String(url || "").trim();
  }
}

function truncate(text, max = DESC_MAX) {
  const next = String(text || "").replace(/\s+/g, " ").trim();
  if (next.length <= max) return next;
  return `${next.slice(0, max - 1).replace(/\s+\S*$/, "").trim()}…`;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToPlain(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripSyndicationChrome(text) {
  return String(text || "")
    .replace(/\n?Click here to add a comment[\s\S]*$/i, "")
    .replace(/\n?Read-only syndicated snapshot[\s\S]*$/i, "")
    .replace(/\n?Made with Amba[\s\S]*$/i, "")
    .trim();
}

function extractElementByClass(html, className) {
  const source = String(html || "");
  const attr = source.search(new RegExp(`class=["'][^"']*\\b${className}\\b[^"']*["']`, "i"));
  if (attr < 0) return "";
  const start = source.lastIndexOf("<", attr);
  const tagMatch = source.slice(start).match(/^<([a-z][a-z0-9]*)/i);
  if (!tagMatch) return "";
  return sliceBalancedTag(source, start, tagMatch[1]);
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

function syndicationBody(html) {
  return extractElementByClass(html, "embedded-document-root")
    || extractElementByClass(html, "synd-content")
    || extractElementByClass(html, "lore-box");
}

function firstHeading(html) {
  const match = String(html || "").match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  return displayAdventureTitle(htmlToPlain(match ? match[1] : ""));
}

function resolveUrl(value, baseUrl) {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("#")) return "";
  try {
    const parsed = new URL(raw, baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function firstBodyImage(html, baseUrl) {
  const re = /<img\b([^>]*)>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[1] || "";
    const src = (attrs.match(/\bsrc=["']([^"']+)["']/i) || [])[1] || "";
    const width = Number((attrs.match(/\bwidth=["']?(\d+)/i) || [])[1] || 0);
    const height = Number((attrs.match(/\bheight=["']?(\d+)/i) || [])[1] || 0);
    if (width === 1 && height === 1) continue;
    const lower = src.toLowerCase();
    if (/pixel|tracking|1x1|spacer\.gif/.test(lower)) continue;
    const resolved = resolveUrl(src, baseUrl);
    if (resolved) return resolved;
  }
  return "";
}

function metaContent(html, keys) {
  const source = String(html || "");
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta\\b[^>]*\\b(?:property|name)=["']${escaped}["'][^>]*\\bcontent=["']([^"']*)["']`, "i"),
      new RegExp(`<meta\\b[^>]*\\bcontent=["']([^"']*)["'][^>]*\\b(?:property|name)=["']${escaped}["']`, "i")
    ];
    for (const pattern of patterns) {
      const found = source.match(pattern);
      if (found && found[1]) return decodeEntities(found[1]).trim();
    }
  }
  return "";
}

function documentTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return htmlToPlain(match ? match[1] : "").replace(/\s*[·|].*$/, "").trim();
}

function fromSyndication(url, html) {
  const body = syndicationBody(html);
  if (!body) return null;
  const titleFromPage = moduleTitleFromSyndication(html);
  const heading = firstHeading(body);
  const title = (!isArtifactTitle(titleFromPage) && titleFromPage)
    || (!isArtifactTitle(heading) && heading)
    || titleFromPage
    || heading
    || hostTitle(url);
  return {
    url,
    kind: "syndication",
    title,
    description: truncate(stripSyndicationChrome(htmlToPlain(body))),
    image: firstBodyImage(body, url),
    siteName: "AMBA"
  };
}

function fromOpenGraph(url, html) {
  const title = metaContent(html, ["og:title", "twitter:title"]) || documentTitle(html) || hostTitle(url);
  const description = truncate(metaContent(html, ["og:description", "twitter:description", "description"]));
  const image = resolveUrl(metaContent(html, ["og:image", "twitter:image"]), url);
  const siteName = metaContent(html, ["og:site_name"]) || hostTitle(url);
  return {
    url,
    kind: isSyndicationUrl(url) ? "syndication" : "web",
    title,
    description,
    image,
    siteName: isSyndicationUrl(url) ? (siteName || "AMBA") : siteName
  };
}

function fromHtml(url, html, fetchedAt = new Date().toISOString()) {
  const clipped = String(html || "").slice(0, HTML_CAP);
  if (isSyndicationUrl(url)) {
    const synd = fromSyndication(url, clipped);
    if (synd) return { ...synd, fetchedAt, fetchError: "" };
  }
  return { ...fromOpenGraph(url, clipped), fetchedAt, fetchError: "" };
}

function failedPreview(url, message, fetchedAt = new Date().toISOString()) {
  const syndication = isSyndicationUrl(url);
  return {
    url,
    kind: syndication ? "syndication" : "web",
    title: hostTitle(url),
    description: "",
    image: "",
    siteName: syndication ? "AMBA" : hostTitle(url),
    fetchedAt,
    fetchError: String(message || "Could not load page")
  };
}

function publicReadingLink(item) {
  const raw = item && typeof item === "object" ? item : {};
  return {
    id: String(raw.id || ""),
    url: String(raw.url || ""),
    kind: raw.kind === "syndication" ? "syndication" : "web",
    title: String(raw.title || ""),
    description: String(raw.description || ""),
    image: String(raw.image || ""),
    siteName: String(raw.siteName || "")
  };
}

module.exports = {
  DESC_MAX,
  failedPreview,
  fromHtml,
  hostTitle,
  isSyndicationUrl,
  publicReadingLink
};
