const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  buildExportSnapshot,
  buildUserNode,
  mergeUserNode,
  coerceImport,
  canonicalRuntime,
  applyImport,
  loadRuntime
} = require("../lib/runtime-backup");

function sampleState() {
  const timeId = "1d37e84a-a4f5-47b1-a91e-def587e61cfd";
  const emptyTimeId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  return {
    site: { defaultSessionId: "amba-workflow-test-1" },
    users: [
      {
        id: "890de159-4506-4314-83ab-ee8e5b7d228f",
        email: "edmund.landgraf@gmail.com",
        handle: "Slippery-Signal",
        discord: "",
        discordUserId: "",
        redditUserId: "",
        timezone: "Pacific",
        characterStatus: "I need to create them",
        role: "admin",
        createdAt: "2026-08-29T14:45:36.300Z",
        updatedAt: "2026-09-02T13:10:45.414Z"
      },
      {
        id: "1f9753fd-ed2e-4dc9-9000-993a8e994437",
        email: "joe@joe.com",
        handle: "Velvet-Compass",
        discord: "",
        discordUserId: "",
        redditUserId: "",
        timezone: "",
        characterStatus: "",
        role: "admin",
        createdAt: "2026-08-29T15:04:22.769Z",
        updatedAt: "2026-08-29T15:04:35.410Z"
      }
    ],
    adventures: [
      {
        id: "amba-workflow-test-1",
        title: "The Palakar Convergence",
        targetPlayers: 4,
        maxPartyPcs: 8,
        playPartyPcs: 4,
        maxPcsPerPlayer: 2,
        format: "Remote",
        scope: "Short adventure",
        times: [
          {
            id: timeId,
            title: "2026-09-03 19:00 Pacific 120 min",
            date: "2026-09-03",
            time: "19:00",
            timezone: "Pacific",
            lengthMinutes: 120,
            note: "",
            createdBy: "edmund.landgraf@gmail.com",
            createdAt: "2026-08-31T16:45:30.344Z",
            signupsDisabled: false
          }
        ],
        syndicationUrl: "https://example.test/syndicate/x",
        playerHookUrl: "https://example.test/syndicate/x/p/1",
        playerHookText: "Trouble along Profit's Flow",
        setupSource: "connect",
        ambaModuleId: "amba-workflow-test-1",
        adminPasswordHash: null,
        signups: [
          {
            id: "4c149803-3114-408a-8720-86b4c78ee6ca",
            email: "edmund.landgraf@gmail.com",
            handle: "Slippery-Signal",
            discord: "",
            timezone: "Pacific",
            role: "admin",
            characterStatus: "I need to create them",
            votes: { [timeId]: "yes" },
            voteNotes: {},
            notes: "",
            createdAt: "2026-08-29T14:48:21.414Z",
            updatedAt: "2026-09-02T06:31:02.141Z"
          },
          {
            id: "45ac0efc-448c-4ada-bc74-671665390294",
            email: "joe@joe.com",
            handle: "Velvet-Compass",
            discord: "",
            timezone: "",
            role: "admin",
            characterStatus: "",
            votes: {},
            voteNotes: {},
            notes: "",
            createdAt: "2026-08-29T15:04:35.410Z",
            updatedAt: "2026-08-29T15:04:35.410Z"
          }
        ],
        wgSheets: [{ email: "edmund.landgraf@gmail.com", sheets: [{ url: "https://example.test/sheet" }] }],
        promote: {
          templates: {
            reddit: { title: "t", body: "b" },
            discord: { body: "d" },
            facebook: { body: "f" }
          },
          settings: { redditSubreddit: "lfg", discordWebhookUrl: "" },
          posts: []
        }
      },
      {
        id: "empty-table",
        title: "Empty table",
        targetPlayers: 4,
        maxPartyPcs: 8,
        playPartyPcs: 4,
        maxPcsPerPlayer: 2,
        format: "Remote",
        scope: "Short adventure",
        times: [
          {
            id: emptyTimeId,
            title: "open slot",
            date: "2026-10-01",
            time: "18:00",
            timezone: "Pacific",
            lengthMinutes: 120,
            note: "",
            createdBy: "",
            createdAt: "2026-09-01T00:00:00.000Z",
            signupsDisabled: false
          }
        ],
        syndicationUrl: "",
        playerHookUrl: "",
        playerHookText: "",
        setupSource: "connect",
        ambaModuleId: "empty-table",
        adminPasswordHash: null,
        signups: [],
        wgSheets: [],
        promote: {
          templates: {
            reddit: { title: "t", body: "b" },
            discord: { body: "d" },
            facebook: { body: "f" }
          },
          settings: { redditSubreddit: "lfg", discordWebhookUrl: "" },
          posts: []
        }
      }
    ],
    feedback: [
      {
        id: "7cd2f156-3e63-4bc5-ad9f-4d0421559ed0",
        email: "edmund.landgraf@gmail.com",
        handle: "Slippery-Signal",
        topic: "WG campaign join",
        message: "www",
        createdAt: "2026-08-29T22:47:48.656Z"
      }
    ],
    questionnaire: {
      questions: [
        {
          id: "notes",
          type: "text",
          label: "Notes",
          required: false,
          options: [],
          createdAt: "2026-09-03T00:00:00.000Z",
          updatedAt: "2026-09-03T00:00:00.000Z"
        }
      ],
      responses: [
        {
          email: "edmund.landgraf@gmail.com",
          handle: "Slippery-Signal",
          answers: { notes: "Ready to test." },
          submittedAt: "2026-09-03T01:00:00.000Z",
          updatedAt: "2026-09-03T01:00:00.000Z"
        }
      ]
    },
    wgExportIndex: { "pack.zip": { email: "edmund.landgraf@gmail.com", name: "pack.zip" } }
  };
}

describe("runtime backup round-trip", () => {
  it("exports and re-imports a sample store with no data loss", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "amba-backup-"));
    const original = sampleState();
    await applyImport(root, original);

    const loaded = await loadRuntime(root);
    const snapshot = buildExportSnapshot({ ...loaded, exportedAt: "2026-09-02T18:00:00.000Z" });

    assert.equal(snapshot.users.find((u) => u.handle === "Slippery-Signal").slotsAdded.length, 1);
    assert.equal(snapshot.users.find((u) => u.handle === "Velvet-Compass").slotsAdded.length, 0);
    const occupied = snapshot.occupancy.find((row) => row.timeId === original.adventures[0].times[0].id);
    assert.equal(occupied.people.length, 1);
    assert.equal(occupied.people[0].status, "yes");
    const emptySlot = snapshot.occupancy.find((row) => row.adventureTitle === "Empty table");
    assert.deepEqual(emptySlot.people, []);
    assert.equal(snapshot.questionnaire.responses[0].answers.notes, "Ready to test.");

    await applyImport(root, {
      site: { defaultSessionId: "gone" },
      users: [],
      adventures: [],
      feedback: [],
      wgExportIndex: {}
    });

    const coerced = coerceImport(snapshot);
    await applyImport(root, coerced);
    const restored = canonicalRuntime(await loadRuntime(root));
    assert.deepEqual(restored, canonicalRuntime(original));
  });

  it("overwrites one user's choices from a user-node without changing other users", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "amba-user-"));
    const original = sampleState();
    await applyImport(root, original);
    const loaded = await loadRuntime(root);
    const node = buildUserNode(loaded, "edmund.landgraf@gmail.com", "2026-09-02T18:00:00.000Z");
    assert.equal(node.kind, "user-node");
    assert.equal(node.questionnaireResponse.answers.notes, "Ready to test.");
    assert.equal(node.slotsAdded[0].adventureTitle, "The Palakar Convergence");
    assert.equal(node.adventures[0].title, "The Palakar Convergence");
    assert.equal(node.slotsAdded.length, 1);
    assert.equal(node.occupancy.length, 1);
    const joeNode = buildUserNode(loaded, "joe@joe.com");
    assert.equal(joeNode.slotsAdded.length, 0);

    node.occupancy[0].status = "no";
    node.adventures[0].signup.votes[node.slotsAdded[0].id] = "no";
    node.questionnaireResponse.answers.notes = "Changed response.";
    const merged = mergeUserNode(await loadRuntime(root), node, "edmund.landgraf@gmail.com");
    await applyImport(root, merged);
    const after = await loadRuntime(root);
    const edmund = after.adventures[0].signups.find((s) => s.email.startsWith("edmund"));
    const joe = after.adventures[0].signups.find((s) => s.email === "joe@joe.com");
    assert.equal(edmund.votes[node.slotsAdded[0].id], "no");
    assert.deepEqual(joe.votes, {});
    assert.equal(after.questionnaire.responses.find((row) => row.email.startsWith("edmund")).answers.notes, "Changed response.");
    assert.equal(after.users.length, 2);
  });

  it("never throws a structural error on junk input", () => {
    const coerced = coerceImport("not json {{{");
    assert.equal(typeof coerced.site.defaultSessionId, "string");
    assert.ok(Array.isArray(coerced.users));
    assert.ok(Array.isArray(coerced.adventures));
    assert.ok(Array.isArray(coerced.feedback));
    assert.deepEqual(coerceImport(null).users, []);
    assert.deepEqual(coerceImport({ users: null, adventures: "nope" }).adventures, []);
  });
});
