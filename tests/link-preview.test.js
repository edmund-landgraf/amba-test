const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { fromHtml, isSyndicationUrl, publicReadingLink } = require("../lib/link-preview");

const SYND_URL = "https://amba.example.test/syndicate/abc/p/11111111-1111-4111-8111-111111111111";
const WEB_URL = "https://www.example.com/blog/post";

describe("link preview", () => {
  it("detects AMBA syndication paths", () => {
    assert.equal(isSyndicationUrl(SYND_URL), true);
    assert.equal(isSyndicationUrl("http://[::1]:3101/syndicate/pj_-lFp-DjHHw_uJ1CXSpQ/n/9642441d-a3b9-4014-be2a-1c8af8d7e449"), true);
    assert.equal(isSyndicationUrl(WEB_URL), false);
  });

  it("extracts syndication body over Open Graph", () => {
    const html = `<!doctype html>
<html>
<head>
  <title>Player Hook - The Fivefold Horizon · Player syndication | AMBA</title>
  <meta property="og:title" content="Generic OG">
  <meta property="og:description" content="OG should lose">
</head>
<body>
  <a class="synd-brand">The Fivefold Horizon</a>
  <article class="embedded-document-root">
    <h1>Gazetteer</h1>
    <p>Blood, gold, and ancient magic in the Palakar Forest. Click here to add a comment later.</p>
    <img src="/maps/cover.png" alt="cover">
    <img width="1" height="1" src="/pixel.gif">
  </article>
</body>
</html>`;
    const preview = fromHtml(SYND_URL, html, "2026-09-04T00:00:00.000Z");
    assert.equal(preview.kind, "syndication");
    assert.equal(preview.siteName, "AMBA");
    assert.equal(preview.title, "The Fivefold Horizon");
    assert.match(preview.description, /Palakar Forest/);
    assert.equal(preview.image, "https://amba.example.test/maps/cover.png");
    assert.equal(preview.fetchError, "");
    assert.doesNotMatch(preview.description, /Click here to add a comment/);
  });

  it("falls back to Open Graph for ordinary pages and relative images", () => {
    const html = `<html><head>
      <meta property="og:title" content="A Field Guide">
      <meta name="description" content="Short notes for players.">
      <meta property="og:image" content="/img/og.jpg">
      <meta property="og:site_name" content="Archives">
    </head></html>`;
    const preview = fromHtml(WEB_URL, html);
    assert.equal(preview.kind, "web");
    assert.equal(preview.title, "A Field Guide");
    assert.equal(preview.description, "Short notes for players.");
    assert.equal(preview.image, "https://www.example.com/img/og.jpg");
    assert.equal(preview.siteName, "Archives");
  });

  it("uses title tag when Open Graph is missing", () => {
    const preview = fromHtml(WEB_URL, "<html><head><title>Bare page</title></head></html>");
    assert.equal(preview.kind, "web");
    assert.equal(preview.title, "Bare page");
    assert.equal(preview.description, "");
    assert.equal(preview.image, "");
  });

  it("publicReadingLink drops fetchError", () => {
    const out = publicReadingLink({
      id: "a",
      url: WEB_URL,
      kind: "web",
      title: "T",
      description: "D",
      image: "",
      siteName: "S",
      fetchError: "nope",
      fetchedAt: "x"
    });
    assert.deepEqual(out, {
      id: "a",
      url: WEB_URL,
      kind: "web",
      title: "T",
      description: "D",
      image: "",
      siteName: "S"
    });
  });
});
