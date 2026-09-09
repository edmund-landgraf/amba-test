const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

// server.js is a CommonJS entry point that starts a listener on import, so lift the
// pure helper out of the source rather than booting the whole server.
function extract(name) {
  let start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `server.js should define ${name}`);
  // Keep a leading `async`, otherwise the extracted body loses the right to await.
  if (source.slice(start - 6, start) === "async ") start -= 6;
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}" && (depth -= 1) === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

function loadAdventureGm() {
  const factory = new Function("normalizeEmail", `${extract("adventureGm")}; return adventureGm;`);
  return factory((value) => String(value || "").trim().toLowerCase());
}

describe("adventure GM", () => {
  const adventureGm = loadAdventureGm();

  it("is exactly one person, not one per timeslot", () => {
    const adventure = {
      times: [
        { createdBy: "b@x.com", createdAt: "2026-02-01T00:00:00Z" },
        { createdBy: "a@x.com", createdAt: "2026-01-01T00:00:00Z" }
      ],
      signups: []
    };
    assert.equal(adventureGm(adventure), "a@x.com", "earliest slot creator wins");
  });

  it("prefers an explicit transfer over slot creators", () => {
    const adventure = {
      gm: "new@x.com",
      times: [{ createdBy: "old@x.com", createdAt: "2026-01-01T00:00:00Z" }],
      signups: []
    };
    assert.equal(adventureGm(adventure), "new@x.com");
  });

  it("falls back to the first person who logged in", () => {
    const adventure = { times: [], signups: [{ email: "first@x.com" }, { email: "second@x.com" }] };
    assert.equal(adventureGm(adventure), "first@x.com");
  });

  it("is empty when nobody has signed up", () => {
    assert.equal(adventureGm({ times: [], signups: [] }), "");
  });
});

function loadCandidates() {
  const factory = new Function(
    "normalizeEmail",
    "zoneIanaMap",
    "wallTimeToUtc",
    "adventureGm",
    `${extract("gmTransferCandidates")}; return gmTransferCandidates;`
  );
  return factory(
    (value) => String(value || "").trim().toLowerCase(),
    async () => ({}),
    (date, time) => new Date(`${date}T${time || "00:00"}:00Z`),
    loadAdventureGm()
  );
}

describe("GM transfer candidates", () => {
  const candidates = loadCandidates();
  const future = "2999-01-01";
  const past = "2000-01-01";

  it("unions yes votes across every upcoming slot and skips past ones", async () => {
    const adventure = {
      gm: "gm@x.com",
      times: [
        { id: "soon", date: future, time: "19:00" },
        { id: "later", date: future, time: "20:00" },
        { id: "gone", date: past, time: "19:00" }
      ],
      signups: [
        { email: "gm@x.com", handle: "Gm", votes: { soon: "yes" } },
        { email: "a@x.com", handle: "Zeta", votes: { soon: "yes" } },
        { email: "b@x.com", handle: "Alpha", votes: { later: "yes" } },
        { email: "c@x.com", handle: "Maybe", votes: { soon: "maybe" } },
        { email: "d@x.com", handle: "OnlyPast", votes: { gone: "yes" } }
      ]
    };
    // Sorted, deduped, GM excluded, non-yes excluded, past-only excluded.
    assert.deepEqual(await candidates(adventure), ["Alpha", "Zeta"]);
  });

  it("lists a player once even when they say yes to several slots", async () => {
    const adventure = {
      gm: "gm@x.com",
      times: [{ id: "a", date: future, time: "19:00" }, { id: "b", date: future, time: "20:00" }],
      signups: [{ email: "p@x.com", handle: "Solo", votes: { a: "yes", b: "yes" } }]
    };
    assert.deepEqual(await candidates(adventure), ["Solo"]);
  });

  it("is empty when nobody else has committed to an upcoming slot", async () => {
    const adventure = {
      gm: "gm@x.com",
      times: [{ id: "a", date: future, time: "19:00" }],
      signups: [{ email: "p@x.com", handle: "Idle", votes: {} }]
    };
    assert.deepEqual(await candidates(adventure), []);
  });
});

describe("transfer GM endpoint", () => {
  it("is routed and guarded", () => {
    assert.match(source, /url\.pathname === "\/api\/transfer-gm"/, "route should exist");
    assert.match(source, /Only the GM can transfer the GM role\./, "must reject non-GM callers");
    assert.match(
      source,
      /allowed\.includes\(wanted\)/,
      "target must come from the candidate list, not arbitrary input"
    );
  });

  it("keeps GM and admin as separate concepts", () => {
    // Admin is the password; GM is a player status shown as a token ring. Neither
    // should ever be derived from the other.
    assert.doesNotMatch(
      extract("transferGm"),
      /adminPassword|adminToken|requireAdmin|isSignedAdminToken/,
      "transferring GM must not touch admin auth"
    );
    assert.doesNotMatch(
      extract("adventureGm"),
      /admin/i,
      "who the GM is must not depend on admin state"
    );
    const login = source.slice(source.indexOf('url.pathname === "/api/admin/login"'));
    assert.doesNotMatch(
      login.slice(0, 400),
      /adventureGm|\bgm\b/,
      "admin login must not consult the GM"
    );
  });

  it("marks the sitting GM on public participants so glance tokens can ring", () => {
    assert.match(source, /gm: Boolean\(gmEmail && signup\.email === gmEmail\)/);
    const scheduler = fs.readFileSync(path.join(__dirname, "..", "src", "scheduler.jsx"), "utf8");
    assert.match(scheduler, /\$\{person\.gm \? " is-gm" : ""\}/);
  });

  it("token hover injects (GM) on the sitting GM handle", () => {
    const scheduler = fs.readFileSync(path.join(__dirname, "..", "src", "scheduler.jsx"), "utf8");
    assert.match(scheduler, /function handleTitle\(person\)/);
    assert.match(scheduler, /person\.gm \? `\$\{handle\} \(GM\)` : handle/);
    assert.match(scheduler, /title=\{handleTitle\(person\)\}/);
    assert.match(scheduler, /title=\{handleTitle\(mine\)\}/);
  });

  it("lets admin reassign the single GM field by handle", () => {
    assert.match(source, /url\.pathname === "\/api\/admin\/assign-gm"/, "admin assign route should exist");
    assert.match(source, /async function assignGm\(\{ handle \} = \{\}\) \{[\s\S]*?adventure\.gm = target\.email/, "assign writes the one GM field");
    assert.doesNotMatch(
      source.slice(source.indexOf("async function assignGm"), source.indexOf("function slotReadyToPlay")),
      /Only the GM can transfer/,
      "admin assign must not require the sitting GM"
    );
    assert.match(
      extract("yesEmails"),
      /gm: normalizeEmail\(signup\.email\) === gm/,
      "yes-email rows should mark the sitting GM"
    );
    const admin = fs.readFileSync(path.join(__dirname, "..", "admin.js"), "utf8");
    assert.match(admin, /Assign GM role/);
    assert.match(admin, /\/api\/admin\/assign-gm/);
  });

  it("never exposes player emails to non-GM callers", () => {
    assert.match(
      source,
      /gmCandidates: gmIsMe \? await gmTransferCandidates\(adventure\) : \[\]/,
      "candidates should only be sent to the sitting GM"
    );
    assert.match(
      source,
      /candidates\.push\(signup\.handle\)/,
      "candidates should be handles, never emails"
    );
  });
});
