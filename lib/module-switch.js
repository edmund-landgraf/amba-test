const crypto = require("node:crypto");
const { emptyAdventure, safeAdventureId, defaultPromote } = require("./adventure-defaults");

function copyRoster(signups) {
  return (Array.isArray(signups) ? signups : [])
    .map((signup) => ({
      id: signup.id || crypto.randomUUID(),
      email: String(signup.email || "").trim().toLowerCase(),
      handle: String(signup.handle || ""),
      discord: String(signup.discord || ""),
      timezone: String(signup.timezone || ""),
      role: String(signup.role || ""),
      characterStatus: String(signup.characterStatus || ""),
      votes: {},
      voteNotes: {},
      createdAt: String(signup.createdAt || new Date().toISOString()),
      updatedAt: new Date().toISOString()
    }))
    .filter((signup) => signup.email);
}

function provisionNewAdventure(previous, fields = {}, existingIds = new Set()) {
  const title = String(fields.title || "").trim() || "An AMBA Adventure";
  let id = safeAdventureId(fields.id || title);
  if (!id || existingIds.has(id)) {
    id = safeAdventureId(`${title}-${crypto.randomUUID().slice(0, 8)}`);
  }
  const prior = previous && typeof previous === "object" ? previous : {};
  const next = emptyAdventure(id);
  next.title = title;
  next.ambaModuleId = String(fields.ambaModuleId || id);
  next.syndicationUrl = String(fields.syndicationUrl || "");
  next.playerHookUrl = String(fields.playerHookUrl || "");
  next.playerHookText = String(fields.playerHookText || "");
  next.targetPlayers = Number(prior.targetPlayers) || next.targetPlayers;
  next.maxPartyPcs = Number(prior.maxPartyPcs) || next.maxPartyPcs;
  next.playPartyPcs = Number(prior.playPartyPcs) || next.playPartyPcs;
  next.maxPcsPerPlayer = Number(prior.maxPcsPerPlayer) || next.maxPcsPerPlayer;
  next.format = String(prior.format || next.format);
  next.scope = String(prior.scope || next.scope);
  next.times = [];
  next.signups = copyRoster(prior.signups);
  next.wgSheets = [];
  next.promote = structuredClone(defaultPromote);
  return next;
}

module.exports = { copyRoster, provisionNewAdventure };
