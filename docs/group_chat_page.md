---
name: Group chat page
overview: Admin creates a Discord text channel named after the module, or selects an existing one. That choice is the site instance chat channel. Discord Open text uses it instead of the hardcoded URL. Chat nav shows signup glance plus the same Open link.
todos:
  - id: nav-page
    content: Chat nav + chat.html with signup Schedule at a glance (glance-only scheduler) and Open text from site Discord preference
    status: pending
  - id: scheduler-glance
    content: Skip add-row/AG Grid when scheduler is glance-only
    status: pending
  - id: admin-discord-channel
    content: Admin Yes panel — Create from module title and select existing guild text channel; save to site.json + adventure
    status: pending
  - id: discord-page-link
    content: discord.html Open text loads selected channel from /api/state; remove hardcoded text channel id
    status: pending
isProject: false
---

# Discord chat channel (admin) + Chat glance page

No homemade chat and no `chat.json`. Discord stores messages, avatars, links, and delete-own. This site stores **which Discord text channel** this instance uses.

## Admin (Yes emails panel)

In [`admin.html`](admin.html) / [`admin.js`](admin.js), under the live Adventure select:

- **Chat channel** `<select>` listing guild text channels (`GET /api/admin/discord-channels`, admin Bearer token).
- Changing the select (or **Use selected**) saves that channel as the instance preference.
- **Create from module title** creates a text channel named from the current adventure title (Discord slug: lowercase, hyphens, max 100). If `#that-name` already exists, select it; do not duplicate. Then save.

Persist on save:

- [`data/runtime/site.json`](data/runtime/site.json): `discordGuildId`, `discordTextChannelId`, `discordTextChannelName` next to `defaultSessionId`. `writeSite` must not drop Discord fields when only the default adventure changes.
- Current adventure JSON: same three fields.
- [`lib/runtime-backup.js`](lib/runtime-backup.js): include them on export/import.

Admin APIs:

- `GET /api/admin/discord-channels`
- `POST /api/admin/discord-channel` body `{ action: "select", channelId }` or `{ action: "create" }`

`DISCORD_BOT_TOKEN` in env. Guild `1534196054944121074`. Bot needs **Manage Channels**. Missing token: show a note; disable create. **Do not create channels on public GET.**

## Discord page Open text

[`discord.html`](discord.html) currently hardcodes Open text to `https://discord.com/channels/1534196054944121074/1543359939957891092`.

Wire that button from `/api/state` (`discordTextUrl`). After admin save, Open text goes to the **selected** channel.

If none saved: Open text falls back to the guild (same as Join). Voice toggle stays on the existing hardcoded voice channel.

## Chat nav + glance

- [`header.js`](header.js): Chat → [`chat.html`](chat.html).
- Chat page copies signup `#status` (Who's in / **Schedule at a glance** / `#schedule-status` / `#schedule-edit-mount`). Hidden `#scheduler[data-glance="only"]`.
- [`src/scheduler.jsx`](src/scheduler.jsx): portal glance table only; no add-row form, no AG Grid.
- Open in Discord on Chat uses the same `discordTextUrl` as Discord Open text.

## Public API

`/api/state` returns `discordTextUrl` and channel name when a preference exists. No channel create on that request.
