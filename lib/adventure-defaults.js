const FALLBACK_ADVENTURE_ID = "amba-workflow-test-1";

const defaultPromote = {
  templates: {
    reddit: {
      title: "[Online] [PF2e] looking for {{players}} players — {{adventureTitle}}",
      body: "We're looking for players for **{{adventureTitle}}** ({{scope}}, {{playFormat}} Pathfinder 2e). Sheets in Wanderer's Guide, map in Owlbear, prep in AMBA, voice on Discord.\n\n**{{hookTitle}}**\n{{hook}}\n\n{{when}}\n\nSign up on the test site (email login, no AMBA account):\n{{signupUrl}}\n\nDiscord: {{discordInvite}}"
    },
    discord: {
      body: "Looking for players for **{{adventureTitle}}** — {{hookTitle}}.\n{{hookShort}}\n\nSign up on the test site (join list, not an AMBA login):\n{{signupUrl}}\n\n{{when}}"
    },
    facebook: {
      body: "Looking for a few players for {{adventureTitle}} ({{playFormat}} Pathfinder 2e, {{scope}}). {{hookTitle}}: {{hook}}\n\nSign up on our test site (not AMBA itself): {{signupUrl}}\n\n{{when}}"
    }
  },
  settings: {
    redditSubreddit: "lfg",
    discordWebhookUrl: ""
  },
  posts: []
};

function emptyAdventure(id) {
  return {
    id,
    title: "An AMBA Adventure",
    targetPlayers: 4,
    format: "Remote",
    scope: "Short adventure",
    times: [],
    syndicationUrl: "",
    playerHookUrl: "",
    playerHookText: "",
    setupSource: "connect",
    ambaModuleId: id,
    adminPasswordHash: null,
    signups: [],
    wgSheets: [],
    promote: structuredClone(defaultPromote)
  };
}

function safeAdventureId(id) {
  const safe = String(id || "").replace(/[^A-Za-z0-9._-]/g, "_");
  return safe || FALLBACK_ADVENTURE_ID;
}

function mergePromote(data) {
  return {
    templates: {
      reddit: {
        title: data?.templates?.reddit?.title || defaultPromote.templates.reddit.title,
        body: data?.templates?.reddit?.body || defaultPromote.templates.reddit.body
      },
      discord: {
        body: data?.templates?.discord?.body || defaultPromote.templates.discord.body
      },
      facebook: {
        body: data?.templates?.facebook?.body || defaultPromote.templates.facebook.body
      }
    },
    settings: {
      redditSubreddit: data?.settings?.redditSubreddit || "lfg",
      discordWebhookUrl: data?.settings?.discordWebhookUrl || ""
    },
    posts: Array.isArray(data?.posts) ? data.posts : []
  };
}

module.exports = {
  FALLBACK_ADVENTURE_ID,
  defaultPromote,
  emptyAdventure,
  safeAdventureId,
  mergePromote
};
