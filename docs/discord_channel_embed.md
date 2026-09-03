---
name: Discord channel embed
overview: "Embed Discord’s official server widget (first-party, no extra bot) and point its invite at #amba-test so Join opens that channel. discord.com itself cannot be iframed."
todos:
  - id: css-panel
    content: Add Discord widget panel styles in styles.css
    status: completed
  - id: index-embed
    content: "Add #amba-test widget section on index.html"
    status: completed
  - id: session-embed
    content: Add the same panel under Session step 2 Discord
    status: completed
isProject: false
---

# Embed Discord via official widget

## Choice

**Use Discord’s official server widget**, not an iframe of [the channel URL](https://discord.com/channels/1534196054944121074/1534196055430795277) and not WidgetBot.

| Option | Channel view | Robustness | Complexity |
|---|---|---|---|
| Iframe `discord.com/channels/...` | Full client | Fails (`X-Frame-Options`) | Low, but broken |
| WidgetBot iframe | Live #amba-test chat | Third-party bot, outages, extra app (your Integrations page currently has **no apps**) | Medium |
| Official widget | Online members + **Join** | First-party, years-stable | Low + one Discord toggle |

The widget does not render channel history. The “pre-selected channel” is the **invite channel**: Join lands in `#amba-test` (chat category). That is the usual Discord-supported way to pin one channel from a website.

## Discord setup (you, in Server Settings)

Not Integrations (webhooks). Use **Widget** (sometimes under Engagement):

1. Enable **Server Widget**.
2. Set **Invite Channel** to `#amba-test`.
3. Confirm the widget URL works: `https://discord.com/widget?id=1534196054944121074&theme=dark`

Until that is on, the iframe is an empty Discord chrome.

## Site changes

Add a compact embed panel (title `#amba-test`, copy that it is the chat channel, **Open in Discord** to the channel URL, iframe of the official widget).

Place it where coordination happens:

- [index.html](index.html) — after the hero (signup is the first landing)
- [session.html](session.html) — under **2. Discord**

Reuse the same markup (copy-paste; this repo is static HTML). Style in [styles.css](styles.css): dark panel, full-width iframe height ~420px, `sandbox` matching Discord’s documented widget attributes (`allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts`).

No server or signup-field changes. No WidgetBot.

## What this is not

In-page live messages, typing, or voice. Those need Discord itself or a third-party bot. This panel is presence + one-click into `#amba-test`.
