const { isArtifactTitle, displayAdventureTitle } = require("./adventure-title");

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

function isHashedUploadName(value) {
  return /^\d{8,}-\d+/.test(String(value || "").replace(/\.pdf$/i, "").trim());
}

function looksLikeFileName(value) {
  const token = String(value || "").trim().replace(/\.pdf$/i, "");
  if (!token || isHashedUploadName(token)) return false;
  return /^[A-Za-z0-9._-]+$/.test(token) && (token.includes("_") || token.includes("-"));
}

function ambaPageTitle(html) {
  const match = String(html || "").match(/<h1\b[^>]*\bpage-title\b[^>]*>([\s\S]*?)<\/h1>/i);
  return htmlToPlain(match ? match[1] : "");
}

function syndicationArtifactType(html) {
  const source = String(html || "");
  if (/syndication-artifact--pdf|\bartifact--pdf\b|synd-tree-link--pdf|artifact-pdf-iframe/i.test(source)) return "pdf";
  if (/syndication-artifact--handout|synd-tree-link--handout/i.test(source)) return "handout";
  return "";
}

function artifactType(url, html = "", stored = "") {
  const fromPage = syndicationArtifactType(html);
  if (fromPage) return fromPage;
  if (stored === "pdf" || stored === "handout") return stored;
  const hay = `${url}\n${html}`.toLowerCase();
  if (/\.pdf(\?|#|"|'|\s|$)/.test(hay) || hay.includes("application/pdf") || /\bopen pdf\b/.test(hay)) {
    return "pdf";
  }
  for (const part of String(html || "").split(/\n/)) {
    if (looksLikeFileName(part)) return "pdf";
  }
  return "handout";
}

function readingTitle(item) {
  const raw = item && typeof item === "object" ? item : {};
  const title = String(raw.title || "").trim();
  if (title && !isHashedUploadName(title) && !looksLikeFileName(title)) return title;
  if (title && looksLikeFileName(title) && raw.artifactType !== "pdf") return title;
  const desc = String(raw.description || "").trim();
  if (desc && !isHashedUploadName(desc) && !looksLikeFileName(desc) && desc.length < 180) return desc;
  return title && !isHashedUploadName(title) ? title.replace(/\.pdf$/i, "") : "";
}

function pdfUrlFromHtml(html, baseUrl) {
  const source = String(html || "");
  const patterns = [
    /<iframe\b[^>]*\bartifact-pdf-iframe\b[^>]*\bsrc=["']([^"']+)["']/i,
    /<iframe\b[^>]*\bsrc=["']([^"']+)["'][^>]*\bartifact-pdf-iframe\b/i,
    /<embed\b[^>]*\bsrc=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i,
    /<iframe\b[^>]*\bsrc=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i,
    /\bhref=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i
  ];
  for (const pattern of patterns) {
    const found = source.match(pattern);
    if (found && found[1]) {
      const resolved = resolveUrl(decodeEntitiesDeep(found[1]), baseUrl);
      if (!resolved) continue;
      try {
        const parsed = new URL(resolved);
        parsed.hash = "";
        return parsed.toString();
      } catch {
        return resolved;
      }
    }
  }
  return "";
}

function decodePdfLiteral(inner) {
  let out = "";
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = inner[i + 1];
    if (next == null) break;
    i += 1;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b") out += "\b";
    else if (next === "f") out += "\f";
    else if (next === "(" || next === ")" || next === "\\") out += next;
    else if (/[0-7]/.test(next)) {
      let oct = next;
      if (/[0-7]/.test(inner[i + 1])) {
        i += 1;
        oct += inner[i];
        if (/[0-7]/.test(inner[i + 1])) {
          i += 1;
          oct += inner[i];
        }
      }
      out += String.fromCharCode(parseInt(oct, 8));
    } else {
      out += next;
    }
  }
  const bytes = Buffer.from(out, "latin1");
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return text.replace(/\u0000/g, "").trim();
  }
  return bytes.toString("utf8").replace(/\u0000/g, "").trim();
}

function titleFromHexPdfString(hex) {
  const clean = String(hex || "").replace(/\s+/g, "");
  if (!clean || clean.length % 2) return "";
  const bytes = Buffer.from(clean, "hex");
  let offset = 0;
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) offset = 2;
  let text = "";
  for (let i = offset; i + 1 < bytes.length; i += 2) {
    text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  }
  return text.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function titleFromPdfBytes(bytes) {
  const source = Buffer.isBuffer(bytes) ? bytes.toString("latin1") : String(bytes || "");
  const xmp = source.match(/<dc:title\b[\s\S]*?<rdf:li\b[^>]*>([^<]+)<\/rdf:li>/i);
  if (xmp && xmp[1]) {
    const title = decodeEntitiesDeep(xmp[1]).replace(/\s+/g, " ").trim();
    if (title && !isHashedUploadName(title)) return title;
  }
  const named = source.match(/\/Title\s*\(((?:\\.|[^\\)])*)\)/);
  if (named) {
    const title = decodePdfLiteral(named[1]).replace(/\s+/g, " ").trim();
    if (title && !isHashedUploadName(title)) return title;
  }
  const hex = source.match(/\/Title\s*<([0-9A-Fa-f]+)>/);
  if (hex && hex[1]) {
    const title = titleFromHexPdfString(hex[1]);
    if (title && !isHashedUploadName(title)) return title;
  }
  return "";
}

function pdfNeedsRescrape(item, adventureTitle = "") {
  const raw = item && typeof item === "object" ? item : {};
  const type = artifactType(raw.url, `${raw.title || ""}\n${raw.description || ""}`, raw.artifactType);
  if (type !== "pdf") return false;
  const title = String(raw.title || "").trim();
  const image = String(raw.image || "");
  const adventure = String(adventureTitle || "").trim();
  if (!title) return true;
  if (adventure && title === adventure) return true;
  if (looksLikeFileName(title) || isHashedUploadName(title)) return true;
  if (/pathfinder|rulesetimages\/pf/i.test(image)) return true;
  return false;
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

function decodeEntitiesDeep(value) {
  let current = String(value || "");
  for (let i = 0; i < 4; i += 1) {
    const next = decodeEntities(current);
    if (next === current) return next;
    current = next;
  }
  return current;
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

function fromSyndication(url, html, options = {}) {
  const body = syndicationBody(html) || extractElementByClass(html, "synd-content") || html;
  const type = artifactType(url, html);
  const heading = firstHeading(body);
  const pageName = ambaPageTitle(html);
  const pdfTitle = String(options.pdfTitle || "").trim();
  const title = (type === "pdf" && pdfTitle)
    || (type !== "pdf" && pageName)
    || (type !== "pdf" && !isArtifactTitle(heading) && heading)
    || (type === "pdf" && pageName && !looksLikeFileName(pageName) && pageName)
    || pdfTitle
    || (!isArtifactTitle(heading) && heading)
    || heading
    || hostTitle(url);
  return {
    url,
    kind: "syndication",
    title,
    description: type === "pdf" ? "" : truncate(stripSyndicationChrome(htmlToPlain(body))),
    image: "",
    siteName: "AMBA"
  };
}

function fromOpenGraph(url, html, options = {}) {
  const type = artifactType(url, html);
  const pdfTitle = String(options.pdfTitle || "").trim();
  const title = (type === "pdf" && pdfTitle)
    || metaContent(html, ["og:title", "twitter:title"])
    || documentTitle(html)
    || hostTitle(url);
  const description = type === "pdf" ? "" : truncate(metaContent(html, ["og:description", "twitter:description", "description"]));
  return {
    url,
    kind: isSyndicationUrl(url) ? "syndication" : "web",
    title,
    description,
    image: "",
    siteName: isSyndicationUrl(url) ? "AMBA" : (metaContent(html, ["og:site_name"]) || hostTitle(url))
  };
}

function fromHtml(url, html, fetchedAt = new Date().toISOString(), options = {}) {
  const clipped = String(html || "").slice(0, HTML_CAP);
  if (isSyndicationUrl(url)) {
    const synd = fromSyndication(url, clipped, options);
    if (synd) {
      return { ...synd, artifactType: artifactType(url, clipped), fetchedAt, fetchError: "" };
    }
  }
  const og = fromOpenGraph(url, clipped, options);
  return { ...og, artifactType: artifactType(url, clipped), fetchedAt, fetchError: "" };
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
    artifactType: artifactType(url),
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
    title: readingTitle(raw),
    description: String(raw.description || ""),
    image: "",
    siteName: String(raw.siteName || ""),
    artifactType: artifactType(raw.url, `${raw.title || ""}\n${raw.description || ""}`, raw.artifactType)
  };
}

module.exports = {
  DESC_MAX,
  artifactType,
  failedPreview,
  fromHtml,
  hostTitle,
  isSyndicationUrl,
  pdfNeedsRescrape,
  pdfUrlFromHtml,
  publicReadingLink,
  readingTitle,
  titleFromPdfBytes
};
