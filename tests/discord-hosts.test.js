const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseDiscordGuildId,
  sanitizeDiscordInviteUrl,
  resolveDiscordHost,
  coerceDiscordHost,
  MANUAL_HOST_VALUE
} = require("../lib/discord-hosts");

describe("discord hosts", () => {
  it("parses guild id from channel and widget URLs", () => {
    assert.equal(
      parseDiscordGuildId("https://discord.com/channels/1534196054944121074/1543359939957891092"),
      "1534196054944121074"
    );
    assert.equal(
      parseDiscordGuildId("https://discord.com/channels/1499020422358896660/1499022016148144208"),
      "1499020422358896660"
    );
    assert.equal(
      parseDiscordGuildId("https://discord.com/widget?id=1534196054944121074&theme=dark"),
      "1534196054944121074"
    );
    assert.equal(parseDiscordGuildId("https://discord.gg/abc"), "");
  });

  it("resolves a named record or a manual URL", () => {
    const hosts = [
      { name: "AMBA", desc: "Table", inviteLink: "https://discord.com/channels/1534196054944121074/1534196055430795277" }
    ];
    const preset = resolveDiscordHost({ name: "AMBA" }, hosts);
    assert.equal(preset.name, "AMBA");
    assert.equal(preset.guildId, "1534196054944121074");
    const custom = resolveDiscordHost({
      name: MANUAL_HOST_VALUE,
      url: "https://discord.gg/table"
    }, hosts);
    assert.equal(custom.name, "Custom");
    assert.equal(custom.guildId, "");
    assert.equal(sanitizeDiscordInviteUrl("discord.gg/table"), "https://discord.gg/table");
  });

  it("drops hosts with no invite", () => {
    assert.equal(coerceDiscordHost({ name: "Empty" }), null);
  });
});
