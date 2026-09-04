const ARTIFACT_TITLES = new Set([
  "player hook",
  "adventure summary",
  "campaign spine",
  "gm rules",
  "gm rules & scaling notes"
]);

function displayAdventureTitle(value) {
  return String(value || "").replace(/\s*\([^)]*\)\s*$/g, "").replace(/\s+/g, " ").trim();
}

function isArtifactTitle(value) {
  const title = displayAdventureTitle(value).toLowerCase();
  return !title || ARTIFACT_TITLES.has(title);
}

function adoptScrapedTitle(current, scraped) {
  const next = displayAdventureTitle(scraped);
  if (!next || isArtifactTitle(next)) return "";
  if (!isArtifactTitle(current)) return "";
  return next;
}

function stripMarkup(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromDocumentTitle(rawTitle) {
  let raw = stripMarkup(rawTitle);
  raw = raw.replace(/\s*[·|].*$/, "").replace(/\s*Player syndication.*$/i, "").trim();
  const parts = raw.split(/\s*[-–—]\s*/).map((part) => displayAdventureTitle(part)).filter(Boolean);
  if (parts.length >= 2) {
    const moduleName = parts.slice(1).join(" - ");
    if (!isArtifactTitle(moduleName)) return moduleName;
    if (!isArtifactTitle(parts[0])) return parts[0];
  }
  const single = displayAdventureTitle(raw);
  return isArtifactTitle(single) ? "" : single;
}

function moduleTitleFromSyndication(html) {
  const source = String(html || "");
  const brand = source.match(/<a\b[^>]*class="[^"]*\bsynd-brand\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
    || source.match(/class="synd-brand"[^>]*>([\s\S]*?)</i);
  const fromBrand = displayAdventureTitle(stripMarkup(brand ? brand[1] : ""));
  if (fromBrand && !isArtifactTitle(fromBrand)) return fromBrand;
  const title = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleFromDocumentTitle(title ? title[1] : "");
}

module.exports = {
  displayAdventureTitle,
  isArtifactTitle,
  adoptScrapedTitle,
  moduleTitleFromSyndication,
  titleFromDocumentTitle
};
