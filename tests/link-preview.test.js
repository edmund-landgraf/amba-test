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
    assert.equal(preview.title, "Gazetteer");
    assert.equal(preview.artifactType, "handout");
    assert.match(preview.description, /Palakar Forest/);
    assert.equal(preview.image, "");
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
    assert.equal(preview.image, "");
    assert.equal(preview.siteName, "Archives");
  });

  it("uses PDF metadata title, not the upload filename", () => {
    const { titleFromPdfBytes, pdfUrlFromHtml, fromHtml, pdfNeedsRescrape } = require("../lib/link-preview");
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Title (ignored) >>\nendobj\n<dc:title><rdf:li xml:lang=\"x-default\">Druma &amp;amp; the Northern Shining Kingdoms - Player Reference</rdf:li></dc:title>\n", "latin1");
    assert.equal(titleFromPdfBytes(pdf), "Druma & the Northern Shining Kingdoms - Player Reference");
    const html = `<html><body>
      <h1 class="page-title">Druma_and_Northern_Shining_Kingdoms_Player_Reference</h1>
      <section class="syndication-artifact syndication-artifact--pdf">
        <iframe class="artifact-pdf-iframe" src="http://[::1]:3101/uploads/1788539146720-552497084.pdf#pagemode=none&amp;navpanes=0"></iframe>
      </section>
    </body></html>`;
    assert.equal(pdfUrlFromHtml(html, "http://[::1]:3101/syndicate/x/n/9642441d-a3b9-4014-be2a-1c8af8d7e449"), "http://[::1]:3101/uploads/1788539146720-552497084.pdf");
    const preview = fromHtml("http://[::1]:3101/syndicate/x/n/9642441d-a3b9-4014-be2a-1c8af8d7e449", html, "2026-09-04T00:00:00.000Z", {
      pdfTitle: "Druma & the Northern Shining Kingdoms - Player Reference"
    });
    assert.equal(preview.artifactType, "pdf");
    assert.equal(preview.title, "Druma & the Northern Shining Kingdoms - Player Reference");
    assert.equal(preview.image, "");
    assert.equal(pdfNeedsRescrape({
      url: "http://[::1]:3101/syndicate/x/n/9642441d-a3b9-4014-be2a-1c8af8d7e449",
      title: "Druma & the Northern Shining Kingdoms - Player Reference",
      artifactType: "pdf"
    }), true);
    assert.equal(pdfNeedsRescrape({
      url: "http://[::1]:3101/syndicate/x/n/9642441d-a3b9-4014-be2a-1c8af8d7e449",
      title: "The Palakar Convergence",
      image: "http://[::1]:3101/images/rulesetImages/pf2e/pathfinder-second-edition.png",
      artifactType: "pdf",
      linkPreviewVersion: 2
    }, "The Palakar Convergence"), true);
  });

  it("does not treat AMBA CSS selectors as a PDF artifact", () => {
    const html = `<!doctype html>
<html>
<head>
  <title>The Price of Prophecy - PC Guide · Player syndication | AMBA</title>
  <style>
    iframe.artifact-pdf-iframe { height: 70vh; }
    .preview-root .syndication-artifact--pdf::before, .preview-root .artifact--pdf::before { content: "PDF"; }
  </style>
</head>
<body>
  <h1 class="page-title">The Price of Prophecy - PC Guide</h1>
  <article class="embedded-document-root">
    <h1>The Price of Prophecy</h1>
    <p>A Player Primer to Macridi and the Palakar Forest.</p>
  </article>
</body>
</html>`;
    const url = "https://amba.unwhelm.online/syndicate/X-HD2YfzXpMs40_SxH3lFA/n/20ef0c3d-d4de-482e-a794-5ef3c3d80a06";
    const preview = fromHtml(url, html);
    assert.equal(preview.artifactType, "handout");
    assert.equal(preview.title, "The Price of Prophecy - PC Guide");
    assert.match(preview.description, /Palakar Forest/);
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
      siteName: "S",
      artifactType: "handout"
    });
  });
});
