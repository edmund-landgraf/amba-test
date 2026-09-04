const PRIVATE_CHARACTER_NAME = "Private character";
const PRIVATE_CHARACTER_DETAIL = "Hidden";
const MAX_WG_CHARACTER_OPTIONS = 6;

function isPrivateCharacterSheet(sheet) {
  return Boolean(sheet?.privateExportName || sheet?.type === "private");
}

function publicPrivateCharacter(sheet, handle = "") {
  return {
    type: "private",
    privateExportName: sheet.privateExportName || "",
    url: "",
    id: "",
    name: PRIVATE_CHARACTER_NAME,
    abc: PRIVATE_CHARACTER_DETAIL,
    level: PRIVATE_CHARACTER_DETAIL,
    imageUrl: "",
    handle: handle || sheet.handle || "",
    inParty: sheet.inParty !== false,
    error: ""
  };
}

function ensurePrivateCharacterOption(pack, zipName, {
  allowWaitlist = false,
  maxPcsPerPlayer = 1,
  now = new Date().toISOString()
} = {}) {
  if (!pack) throw new Error("not_found");
  if (!zipName) throw new Error("bad_filename");
  const sheets = Array.isArray(pack.sheets) ? pack.sheets.slice() : [];
  const index = sheets.findIndex((sheet) => isPrivateCharacterSheet(sheet) && sheet.privateExportName === zipName);
  const previous = index >= 0 ? sheets[index] : null;
  if (!previous && sheets.length >= MAX_WG_CHARACTER_OPTIONS) throw new Error("sheet_limit");
  const inPartyCount = sheets.filter((sheet) => sheet.inParty !== false).length;
  const canJoinParty = previous && previous.inParty !== false ? true : inPartyCount < maxPcsPerPlayer;
  if (!canJoinParty && !allowWaitlist) throw new Error("party_per_player_limit");
  const next = {
    ...(previous || {}),
    type: "private",
    privateExportName: zipName,
    name: PRIVATE_CHARACTER_NAME,
    abc: PRIVATE_CHARACTER_DETAIL,
    level: PRIVATE_CHARACTER_DETAIL,
    imageUrl: "",
    url: "",
    inParty: canJoinParty,
    updatedAt: now
  };
  if (index >= 0) sheets[index] = next;
  else sheets.push(next);
  pack.sheets = sheets;
  return next;
}

function removePrivateCharacterOption(pack, zipName) {
  if (!pack) return false;
  const before = Array.isArray(pack.sheets) ? pack.sheets.length : 0;
  pack.sheets = (pack.sheets || []).filter((sheet) => {
    return !(isPrivateCharacterSheet(sheet) && sheet.privateExportName === zipName);
  });
  return pack.sheets.length !== before;
}

module.exports = {
  MAX_WG_CHARACTER_OPTIONS,
  PRIVATE_CHARACTER_DETAIL,
  PRIVATE_CHARACTER_NAME,
  ensurePrivateCharacterOption,
  isPrivateCharacterSheet,
  publicPrivateCharacter,
  removePrivateCharacterOption
};
