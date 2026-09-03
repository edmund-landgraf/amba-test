const MANUAL_HOST_VALUE = "__manual__";

const DEFAULT_DISCORD_HOSTS = [
  {
    name: "AMBA Test",
    desc: "AMBA adventure Discord. Enable Server Widget there to load the in-page bot.",
    inviteLink: "https://discord.com/channels/1534196054944121074/"
  },
  {
    name: "Unwhelm",
    desc: "Unwhelm Discord. Hover for this note; change Invite Link in data/discord-hosts.json if needed.",
    inviteLink: "https://discord.com/channels/1534196054944121074/"
  }
];

function asHost(item) {
  const raw = item && typeof item === "object" ? item : {};
  const name = String(raw.name || "").trim();
  const desc = String(raw.desc || "").trim();
  const inviteLink = sanitizeDiscordInviteUrl(raw.inviteLink);
  if (!name) return null;
  return {
    name,
    desc,
    inviteLink,
    guildId: parseDiscordGuildId(inviteLink || raw.inviteLink)
  };
}

function listDiscordHosts(records) {
  const source = Array.isArray(records) && records.length ? records : DEFAULT_DISCORD_HOSTS;
  return source.map(asHost).filter(Boolean);
}

function parseDiscordGuildId(value) {
  const raw = String(value || "").trim();
  if (/^\d{17,20}$/.test(raw)) return raw;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "discord.com" && host !== "discordapp.com") return "";
    const channels = url.pathname.match(/^\/channels\/(\d{17,20})(?:\/|$)/);
    if (channels) return channels[1];
    if (url.pathname.replace(/\/$/, "") === "/widget") {
      const id = String(url.searchParams.get("id") || "");
      if (/^\d{17,20}$/.test(id)) return id;
    }
  } catch {
    return "";
  }
  return "";
}

function sanitizeDiscordInviteUrl(value) {
  let raw = String(value || "").trim();
  if (!raw || /[…]/.test(raw) || /\s/.test(raw)) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (!["discord.com", "discordapp.com", "discord.gg"].includes(host)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function coerceDiscordHost(raw) {
  if (!raw || typeof raw !== "object") return null;
  const host = asHost(raw);
  if (!host?.inviteLink && !host?.name) return null;
  if (!host?.inviteLink) return null;
  return host;
}

function resolveDiscordHost(data, records) {
  const hosts = listDiscordHosts(records);
  const name = String(data?.name || "").trim();
  const url = sanitizeDiscordInviteUrl(data?.url);
  if (!name) return null;
  if (name === MANUAL_HOST_VALUE) {
    if (!url) throw new Error("discord_url_required");
    return {
      name: "Custom",
      desc: "Pasted Discord server URL.",
      inviteLink: url,
      guildId: parseDiscordGuildId(url)
    };
  }
  const preset = hosts.find((item) => item.name === name);
  if (!preset) throw new Error("discord_host_unknown");
  const inviteLink = preset.inviteLink || url;
  if (!inviteLink) throw new Error("discord_url_required");
  return {
    name: preset.name,
    desc: preset.desc,
    inviteLink,
    guildId: parseDiscordGuildId(inviteLink)
  };
}

module.exports = {
  MANUAL_HOST_VALUE,
  DEFAULT_DISCORD_HOSTS,
  listDiscordHosts,
  parseDiscordGuildId,
  sanitizeDiscordInviteUrl,
  coerceDiscordHost,
  resolveDiscordHost
};
