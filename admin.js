window.mountAmbaAdmin = function mountAmbaAdmin(root, options = {}) {
  const q = (sel) => root.querySelector(sel);
  if (!root || root.dataset.adminMounted === "1") return;
  root.dataset.adminMounted = "1";
  let promoteState = null;
  let questionnaireState = { questions: [], responses: [] };
    const token = (() => {
      const cookie = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("ambaAdminToken="));
      if (cookie) {
        try {
          return decodeURIComponent(cookie.slice("ambaAdminToken=".length));
        } catch {
          return cookie.slice("ambaAdminToken=".length);
        }
      }
      return localStorage.getItem("ambaAdminToken") || sessionStorage.getItem("ambaAdminToken") || "";
    })();
    if (token) {
      localStorage.setItem("ambaAdminToken", token);
      sessionStorage.removeItem("ambaAdminToken");
      document.cookie = `ambaAdminToken=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    }
    function clearAdminToken() {
      localStorage.removeItem("ambaAdminToken");
      sessionStorage.removeItem("ambaAdminToken");
      document.cookie = "ambaAdminToken=; Path=/; Max-Age=0; SameSite=Lax";
    }

    const yesList = q("#yesList");
    const yesStatus = q("#yesStatus");
    const copyNote = q("#copyNote");
    const syndicationUrl = q("#syndicationUrl");
    const playerHookUrl = q("#playerHookUrl");
    const summaryPreview = q("#summaryPreview");
    const playerHookPreview = q("#playerHookPreview");
    const adventureSelect = q("#adventureSelect");
    const adventureName = q("#adventureName");
    const adventurePickerNote = q("#adventurePickerNote");
    const sessionLinksToggle = q("#sessionLinksToggle");
    const sessionLinksNote = q("#sessionLinksNote");
    const ambaConnectNote = q("#ambaConnectNote");
    const ambaLinkedFields = q("#ambaLinkedFields");
    const manualWritePanel = q("#manualWritePanel");
    const manualTitle = q("#manualTitle");
    const manualHook = q("#manualHook");
    const manualHookToolbar = q("#manualHookToolbar");
    if (window.attachMarkdownToolbar) window.attachMarkdownToolbar(manualHookToolbar, manualHook);
    function ambaApiOrigins() {
      const host = String(location.hostname || "");
      if (host === "localhost" || host === "127.0.0.1") {
        const proto = location.protocol;
        return [`${proto}//${host}:5190`, `${proto}//${host}:3101`];
      }
      if (host === "amba.unwhelm.online") return [location.origin];
      return ["https://amba.unwhelm.online"];
    }

    function ambaApiOrigin() {
      return ambaApiOrigins()[0];
    }
    let linksEditing = false;
    let ambaModules = null;
    let liveAmbaModuleId = "";
    let setupMode = "connect";
    let lastAdventureData = null;
    let people = [];
    let selfEmail = "";
    let slot = null;
    let adventureTitle = "";
    const defaultTemplates = {
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
    };
    const discordInvite = "https://discord.com/channels/1534196054944121074/";

    const headers = () => ({
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    });

    function bindPreview(link, href) {
      const url = String(href || "").trim();
      const ok = /^https?:\/\//i.test(url);
      link.classList.toggle("is-empty", !ok);
      if (ok) {
        link.href = url;
        link.title = url;
        link.removeAttribute("aria-disabled");
        link.onclick = null;
      } else {
        link.removeAttribute("href");
        link.removeAttribute("title");
        link.setAttribute("aria-disabled", "true");
        link.onclick = (event) => event.preventDefault();
      }
    }

    function refreshPreviews() {
      bindPreview(summaryPreview, syndicationUrl.value);
      bindPreview(playerHookPreview, playerHookUrl.value);
      const summary = String(syndicationUrl.value || "").trim();
      const hook = String(playerHookUrl.value || "").trim();
      syndicationUrl.title = summary;
      playerHookUrl.title = hook;
    }

    function setLinksEditing(on) {
      linksEditing = Boolean(on);
      syndicationUrl.readOnly = !linksEditing;
      playerHookUrl.readOnly = !linksEditing;
      sessionLinksToggle.textContent = linksEditing ? "Save" : "Edit";
      sessionLinksToggle.type = "button";
    }

    function setAmbaConnectionStatus(connected) {
      const el = q("#ambaStatus");
      if (!el) return;
      el.textContent = connected ? "Connected" : "Not connected";
      el.classList.toggle("status-pill--on", connected);
      el.classList.toggle("status-pill--off", !connected);
      const refreshBtn = q("#refreshAmba");
      if (refreshBtn) refreshBtn.disabled = !connected;
    }

    function setAmbaConnectNote(message) {
      if (ambaConnectNote) ambaConnectNote.textContent = message;
    }

    function setSetupMode(mode, options = {}) {
      setupMode = mode === "manual" || mode === "write" ? mode : "connect";
      const connectBtn = q("#connectAmba");
      const manualBtn = q("#manualAmba");
      const writeBtn = q("#writeManual");
      const isManual = setupMode === "manual";
      const isWrite = setupMode === "write";
      const isConnect = setupMode === "connect";
      if (sessionLinksToggle) sessionLinksToggle.hidden = !isManual;
      if (ambaLinkedFields) ambaLinkedFields.hidden = isWrite;
      if (manualWritePanel) manualWritePanel.hidden = !isWrite;
      if (connectBtn) {
        connectBtn.classList.toggle("primary", isConnect);
        connectBtn.classList.toggle("secondary", !isConnect);
        connectBtn.classList.toggle("is-active", isConnect);
      }
      if (manualBtn) {
        manualBtn.classList.toggle("primary", isManual);
        manualBtn.classList.toggle("secondary", !isManual);
        manualBtn.classList.toggle("is-active", isManual);
      }
      if (writeBtn) {
        writeBtn.classList.toggle("primary", isWrite);
        writeBtn.classList.toggle("secondary", !isWrite);
        writeBtn.classList.toggle("is-active", isWrite);
      }
      if (isWrite) {
        ambaModules = null;
        setAmbaConnectionStatus(false);
        setLinksEditing(false);
        syncAdventurePicker();
        if (manualTitle) manualTitle.value = displayAdventureTitle(adventureTitle) || adventureTitle || "";
        setAmbaConnectNote("Manual. The markdown below is the player hook and adventure summary on signup.");
        return;
      }
      if (isManual) {
        ambaModules = null;
        setAmbaConnectionStatus(false);
        if (adventureSelect) adventureSelect.dataset.source = "manual";
        setLinksEditing(true);
        syncAdventurePicker();
        setAmbaConnectNote("Manual AMBA. Paste the adventure summary and player-hook syndication links, then Save.");
        return;
      }
      setLinksEditing(false);
      if (lastAdventureData) fillAdventureSelect(lastAdventureData);
      syncAdventurePicker();
      if (!options.silent && !ambaModules) {
        setAmbaConnectNote(ambaConnectCopy());
      }
    }

    function displayAdventureTitle(value) {
      return String(value || "").replace(/\s*\([^)]*\)\s*$/g, "").replace(/\s+/g, " ").trim();
    }

    function syncAdventurePicker() {
      const connected = Boolean(ambaModules);
      if (adventureSelect) adventureSelect.hidden = !connected;
      if (adventureName) {
        adventureName.hidden = connected;
        adventureName.disabled = true;
        adventureName.readOnly = true;
        if (!connected) adventureName.value = displayAdventureTitle(adventureTitle) || adventureTitle || "";
      }
      if (adventurePickerNote) adventurePickerNote.hidden = !connected;
    }

    function fillAdventureSelect(data) {
      lastAdventureData = data;
      adventureTitle = displayAdventureTitle(data.title) || String(data.title || "").trim();
      if (adventureName) adventureName.value = adventureTitle;
      syncAdventurePicker();
      if (!ambaModules) return;
      fillAmbaModuleSelect(ambaModules, preferredAmbaModule(ambaModules)?.id || "");
    }

    function parseAmbaModules(payload) {
      const list = Array.isArray(payload) ? payload : payload?.modules || [];
      return list.filter((module) => module && module.id && (!module.publicationStatus || module.publicationStatus === "published"));
    }

    function preferredAmbaModule(modules) {
      return modules.find((module) => module.id === liveAmbaModuleId)
        || modules.find((module) => module.adventureSummaryUrl && module.adventureSummaryUrl === syndicationUrl.value)
        || modules.find((module) => module.playerHookUrl && module.playerHookUrl === playerHookUrl.value)
        || modules[0]
        || null;
    }

    function applyAmbaModule(module) {
      if (!module) return;
      syndicationUrl.value = module.adventureSummaryUrl || "";
      playerHookUrl.value = module.playerHookUrl || "";
      refreshPreviews();
    }

    function fillAmbaModuleSelect(modules, selectedId) {
      adventureSelect.replaceChildren();
      for (const module of modules) {
        const option = document.createElement("option");
        option.value = module.id;
        option.textContent = displayAdventureTitle(module.title) || module.title || module.id;
        option.selected = module.id === selectedId;
        adventureSelect.append(option);
      }
      adventureSelect.dataset.source = "amba";
      adventureSelect.dataset.liveId = selectedId || "";
      adventureSelect.disabled = !modules.length;
      syncAdventurePicker();
    }

    function ambaConnectCopy() {
      const origin = ambaApiOrigin();
      const local = /localhost|127\.0\.0\.1/.test(origin);
      return local
        ? `This page talks to AMBA at ${origin} (same browser login as Adventure Maker). Log in there, then try Connect to AMBA again. Or use Manual AMBA to paste the two links.`
        : `This page talks to AMBA at ${origin}, which trusts amba-play and amba-test. Log in to AMBA, then try Connect to AMBA again. Or use Manual AMBA to paste the two links.`;
    }

    function ambaLoginHint(detail) {
      setAmbaConnectNote(detail || ambaConnectCopy());
    }

    async function fetchPublishedModules(origin) {
      const response = await fetch(`${origin}/api/modules?status=published`, {
        credentials: "include",
        mode: "cors",
        headers: { accept: "application/json" }
      });
      return { origin, response };
    }

    async function connectToAmba() {
      const origins = ambaApiOrigins();
      setAmbaConnectNote(`Connecting to AMBA (${origins.join(", ")})…`);
      let lastOrigin = origins[0];
      let lastStatus = 0;
      let lastKind = "network";
      try {
        let matched = null;
        for (const origin of origins) {
          lastOrigin = origin;
          try {
            const { response } = await fetchPublishedModules(origin);
            lastStatus = response.status;
            const contentType = response.headers.get("content-type") || "";
            if (response.status === 401 || response.status === 403) {
              lastKind = "auth";
              continue;
            }
            if (!response.ok || !contentType.includes("json")) {
              lastKind = "http";
              continue;
            }
            matched = { origin, modules: parseAmbaModules(await response.json()) };
            break;
          } catch {
            lastKind = "network";
          }
        }
        if (!matched) {
          ambaModules = null;
          setAmbaConnectionStatus(false);
          syncAdventurePicker();
          if (lastKind === "auth") {
            ambaLoginHint(`AMBA did not see a logged-in session (${lastOrigin}). Log in at ${origins[0]}/app, then try again.`);
            return;
          }
          ambaLoginHint(`Could not reach AMBA API at /api/modules (not /app) via ${origins.join(" or ")}. Restart Adventure Maker so CORS allows ${location.origin}.`);
          return;
        }
        ambaModules = matched.modules;
        setAmbaConnectionStatus(true);
        setSetupMode("connect", { silent: true });
        const selected = preferredAmbaModule(matched.modules);
        fillAmbaModuleSelect(matched.modules, selected?.id || "");
        if (selected) {
          applyAmbaModule(selected);
          adventureTitle = displayAdventureTitle(selected.title) || selected.title || adventureTitle;
        }
        setAmbaConnectNote(
          matched.modules.length
            ? `Connected to ${matched.origin}. ${matched.modules.length} published module${matched.modules.length === 1 ? "" : "s"}.`
            : `Connected to ${matched.origin}, but there are no published modules yet.`
        );
      } catch {
        ambaModules = null;
        setAmbaConnectionStatus(false);
        syncAdventurePicker();
        ambaLoginHint(`Could not reach AMBA API at /api/modules via ${lastOrigin}${lastStatus ? ` (${lastStatus})` : ""}.`);
      }
    }

    

    async function load() {
      try {
        const response = await fetch("/api/admin/yes-emails", {
          headers: { authorization: `Bearer ${token}` }
        });
        if (!response.ok) {
          yesStatus.textContent = response.status === 401
            ? "Admin session expired. Close this and open +a again."
            : `Could not load yes emails (${response.status}).`;
          if (options.page) window.location.href = "index.html";
          else options.onUnauthorized?.();
          return;
        }
        const data = await response.json();
        fillAdmin(data);
        await loadPromote();
        const hash = location.hash.replace("#", "");
        if (hash === "setup" || hash === "promote" || hash === "backup") showTab(hash);
      } catch (error) {
        yesStatus.textContent = error.message || "Could not load yes emails.";
      }
    }

    function fillAdmin(data) {
      selfEmail = data.selfEmail || "";
      slot = data.slot || null;
      adventureTitle = String(data.title || "").trim();
      liveAmbaModuleId = String(data.ambaModuleId || "").trim();
      syndicationUrl.value = data.syndicationUrl || "";
      playerHookUrl.value = data.playerHookUrl || "";
      if (manualHook) manualHook.value = data.playerHookText || "";
      if (manualTitle) manualTitle.value = displayAdventureTitle(data.title) || data.title || "";
      refreshPreviews();
      render(data.emails || []);
      fillAdventureSelect(data);
      setSetupMode(data.setupSource === "manual" ? "write" : setupMode, { silent: true });
    }

    function render(nextPeople) {
      people = nextPeople;
      q("#mailVia").disabled = !people.length;
      yesStatus.textContent = people.length ? `${people.length} yes` : "No yes emails yet.";
      yesList.replaceChildren();
      if (!people.length) return;

      const header = document.createElement("div");
      header.className = "email-row email-head";
      header.innerHTML = "<span>Handle</span><span>Email</span><span></span>";
      yesList.append(header);

      for (const person of people) {
        const row = document.createElement("div");
        row.className = "email-row";
        const handle = document.createElement("span");
        handle.textContent = person.handle || "—";
        const email = document.createElement("span");
        email.textContent = person.email;
        const remove = document.createElement("button");
        remove.className = "button danger";
        remove.type = "button";
        remove.textContent = "Delete";
        remove.addEventListener("click", () => deleteEmail(person));
        row.append(handle, email, remove);
        yesList.append(row);
      }
    }

    async function deleteEmail(person) {
      if (!confirm(`Delete ${person.email} from this site?`)) return;
      const response = await fetch("/api/admin/delete-email", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email: person.email })
      });
      if (!response.ok) {
        copyNote.textContent = "Could not delete that email.";
        return;
      }
      const data = await response.json();
      fillAdmin(data);
      copyNote.textContent = `Deleted ${person.email}.`;
    }

    function slotWhen(nextSlot) {
      if (!nextSlot?.date) return "";
      const length = nextSlot.lengthMinutes ? `${nextSlot.lengthMinutes} min` : "";
      return [nextSlot.date, nextSlot.time, nextSlot.timezone, length].filter(Boolean).join(" ");
    }

    function mailDraft() {
      const when = slotWhen(slot);
      const handles = [...new Set((slot?.handles || people.map((person) => person.handle)).filter(Boolean))];
      const yesEmails = people.map((person) => person.email).filter(Boolean);
      const bcc = yesEmails.filter((email) => email !== selfEmail);
      const to = selfEmail || bcc[0] || yesEmails[0] || "";
      const packet = String(syndicationUrl.value || "").trim();
      const origin = window.location.origin;
      const subject = adventureTitle || "An AMBA Adventure";
      const body = [
        "Hi,",
        "",
        when ? `We have critical mass for ${when}.` : "We have critical mass for a sit-down.",
        handles.length ? `Yes so far: ${handles.join(", ")}.` : "",
        "",
        "A new way for GMs to play adventures: sheets in WG, the map in Owlbear, GM prep in AMBA. Bring two public characters; on Discord we'll pick four of eight to play.",
        "",
        packet ? `Player packet: ${packet}` : "",
        `Signup: ${origin}/`,
        `Session order: ${origin}/session.html`,
        "",
        "See you then."
      ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\r\n");

      if (!to) {
        copyNote.textContent = "No email address to open a draft with.";
        return false;
      }

      const parts = [];
      if (selfEmail) parts.push(`cc=${encodeURIComponent(selfEmail)}`);
      if (bcc.length) parts.push(`bcc=${encodeURIComponent(bcc.join(","))}`);
      parts.push(`subject=${encodeURIComponent(subject)}`);
      parts.push(`body=${encodeURIComponent(body)}`);
      const href = `mailto:${encodeURIComponent(to)}?${parts.join("&")}`;
      const link = document.createElement("a");
      link.href = href;
      document.body.append(link);
      link.click();
      link.remove();

      const eml = [
        "X-Unsent: 1",
        `To: ${to}`,
        selfEmail ? `Cc: ${selfEmail}` : "",
        bcc.length ? `Bcc: ${bcc.join(", ")}` : "",
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=utf-8",
        "",
        body
      ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\r\n");
      const file = new Blob([eml], { type: "message/rfc822" });
      const fileUrl = URL.createObjectURL(file);
      const download = document.createElement("a");
      download.href = fileUrl;
      download.download = "amba-yes-invite.eml";
      document.body.append(download);
      download.click();
      download.remove();
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 2000);
      return { bccCount: bcc.length };
    }

    function clipText(text, max) {
      const value = String(text || "").replace(/\s+/g, " ").trim();
      if (value.length <= max) return value;
      const cut = value.slice(0, max - 1);
      const space = cut.lastIndexOf(" ");
      return `${(space > 40 ? cut.slice(0, space) : cut).trim()}…`;
    }

    function adventureVars(session) {
      const adventureTitle = String(session?.title || "An AMBA Adventure").trim();
      const hookText = String(session?.playerHookText || "").trim();
      const parts = hookText
        .split(/\n\s*\n/)
        .map((part) => part.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const hookTitle = parts[0] || adventureTitle;
      const hookRest = parts.slice(1).join(" ");
      const format = String(session?.format || "").trim();
      const playFormat = /remote|online/i.test(format) || !format ? "Online" : format;
      return {
        adventureTitle,
        hookTitle,
        hook: clipText(hookRest || hookTitle, 450),
        hookShort: clipText(hookRest || hookTitle, 220),
        playFormat,
        scope: String(session?.scope || "Short adventure").trim(),
        players: String(session?.targetPlayers || 4),
        discordInvite,
        when: slotWhen(slot)
      };
    }

    function expandTemplate(text, vars) {
      return String(text || "").replace(/\{\{(\w+)\}\}/g, (_, key) => (
        vars[key] == null ? "" : String(vars[key])
      ));
    }

    function signupUrl(platform) {
      return `${location.origin}/?utm_source=${encodeURIComponent(platform)}&utm_medium=promote&utm_campaign=lfg`;
    }

    function filledFrom(templates, session) {
      const base = adventureVars(session);
      const reddit = { ...base, signupUrl: signupUrl("reddit") };
      const discord = { ...base, signupUrl: signupUrl("discord") };
      const facebook = { ...base, signupUrl: signupUrl("facebook") };
      const source = {
        reddit: {
          title: templates?.reddit?.title || defaultTemplates.reddit.title,
          body: templates?.reddit?.body || defaultTemplates.reddit.body
        },
        discord: { body: templates?.discord?.body || defaultTemplates.discord.body },
        facebook: { body: templates?.facebook?.body || defaultTemplates.facebook.body }
      };
      return {
        source,
        reddit: {
          title: expandTemplate(source.reddit.title, reddit),
          body: expandTemplate(source.reddit.body, reddit)
        },
        discord: { body: expandTemplate(source.discord.body, discord) },
        facebook: { body: expandTemplate(source.facebook.body, facebook) }
      };
    }

    async function loadPromote() {
      let data = null;
      try {
        const response = await fetch("/api/admin/promote", {
          headers: { authorization: `Bearer ${token}` }
        });
        if (response.ok) data = await response.json();
      } catch {
        data = null;
      }
      let session = null;
      try {
        const state = await (await fetch("/api/state")).json();
        session = state.session || null;
      } catch {
        session = null;
      }
      fillPromote(data, session);
    }

    function fillPromote(data, session) {
      promoteState = data;
      const filled = filledFrom(data?.templates || defaultTemplates, session);
      const redditTitle = data?.previews?.reddit?.title || filled.reddit.title;
      const redditBody = data?.previews?.reddit?.body || filled.reddit.body;
      const discordBody = data?.previews?.discord?.body || filled.discord.body;
      const facebookBody = data?.previews?.facebook?.body || filled.facebook.body;
      q("#tplRedditTitle").value = redditTitle;
      q("#tplRedditBody").value = redditBody;
      q("#tplDiscordBody").value = discordBody;
      q("#tplFacebookBody").value = facebookBody;
      q("#redditSubreddit").value = data?.settings?.redditSubreddit || "lfg";
      q("#redditTitle").value = redditTitle;
      q("#redditBody").value = redditBody;
      q("#discordBody").value = discordBody;
      q("#facebookBody").value = facebookBody;
      q("#promoteSignupPreview").textContent =
        `Filled from ${session?.title || data?.adventure?.title || "the loaded adventure"}. Signup links point at this site. Discord invite ${data?.discordInvite || discordInvite}`;
      q("#discordWebhookHint").textContent = data?.settings?.discordWebhookSet
        ? `A webhook is saved (${data.settings.discordWebhookHint}). Paste a new URL only to replace it.`
        : "Paste a channel webhook URL. Stored on the server when you save.";
      q("#redditNote").textContent = data?.redditCanPost
        ? "Reddit API credentials are set. Post will submit a self post."
        : "No Reddit API credentials. Use Copy and open Reddit, then paste.";
      if (q("#redditPost")) {
        q("#redditPost").disabled = !data?.redditCanPost;
      }
      if (!data) {
        q("#templatesNote").textContent =
          "Showing the adventure on this site. Restart the Node server to save or post.";
      }
      renderPosts(data?.posts || []);
    }

    function renderPosts(posts) {
      const list = q("#postsList");
      list.replaceChildren();
      if (!posts.length) {
        q("#postsNote").textContent = "No posts yet.";
        return;
      }
      q("#postsNote").textContent = `${posts.length} recorded post(s).`;
      const head = document.createElement("div");
      head.className = "email-row email-head promote-post-row";
      head.innerHTML = "<span>Platform</span><span>Where</span><span>Status</span><span></span>";
      list.append(head);
      for (const post of posts) {
        const row = document.createElement("div");
        row.className = "email-row promote-post-row";
        const platform = document.createElement("span");
        platform.textContent = post.platform;
        const dest = document.createElement("span");
        dest.textContent = post.permalink || post.destination || "—";
        const status = document.createElement("span");
        status.textContent = post.status;
        const actions = document.createElement("span");
        actions.className = "promote-actions";
        const addBtn = (label, className, fn) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = className;
          button.textContent = label;
          button.addEventListener("click", fn);
          actions.append(button);
        };
        if (post.status !== "deleted" && (post.platform === "discord" || (post.platform === "reddit" && promoteState?.redditCanPost))) {
          addBtn("Edit", "button secondary", () => editPost(post));
          addBtn("Delete remote", "button danger", () => deletePost(post, false));
        }
        if (post.status !== "filled" && post.status !== "deleted") {
          addBtn("Mark filled", "button secondary", () => markFilled(post));
        }
        addBtn("Permalink", "button secondary", () => setPermalink(post));
        addBtn("Forget", "button danger", () => deletePost(post, true));
        row.append(platform, dest, status, actions);
        list.append(row);
      }
    }

    async function promoteFetch(url, options) {
      const response = await fetch(url, options);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || data.error || response.statusText);
      }
      return data;
    }

    async function loadQuestionnaire() {
      const note = q("#questionnaireBuilderNote");
      try {
        questionnaireState = await promoteFetch("/api/admin/questionnaire", {
          headers: { authorization: `Bearer ${token}` }
        });
        renderQuestionnaireBuilder();
        renderQuestionnairePreview();
        renderQuestionnaireResponses();
        if (note) note.textContent = "";
      } catch (error) {
        if (note) note.textContent = error.message;
      }
    }

    function blankQuestion(type = "text") {
      const id = `question-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      return {
        id,
        type,
        label: "",
        required: false,
        options: type === "text" ? [] : ["Option 1", "Option 2"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    function renderQuestionnaireBuilder() {
      const list = q("#questionnaireBuilderList");
      if (!list) return;
      list.replaceChildren();
      const questions = questionnaireState.questions || [];
      if (!questions.length) {
        const empty = document.createElement("p");
        empty.className = "form-note";
        empty.textContent = "No questions yet. Add one to start.";
        list.append(empty);
        return;
      }
      questions.forEach((question, index) => {
        list.append(questionEditor(question, index));
      });
    }

    function questionEditor(question, index) {
      const card = document.createElement("section");
      card.className = "question-editor";
      card.dataset.index = String(index);

      const top = document.createElement("div");
      top.className = "question-editor-top";
      const title = document.createElement("strong");
      title.textContent = `Question ${index + 1}`;
      const actions = document.createElement("p");
      actions.className = "question-editor-actions";
      const up = smallButton("Up", () => moveQuestion(index, -1));
      const down = smallButton("Down", () => moveQuestion(index, 1));
      const remove = smallButton("Remove", () => removeQuestion(index));
      up.disabled = index === 0;
      down.disabled = index === (questionnaireState.questions || []).length - 1;
      actions.append(up, down, remove);
      top.append(title, actions);

      const label = document.createElement("label");
      label.textContent = "Prompt";
      const prompt = document.createElement("input");
      prompt.value = question.label || "";
      prompt.placeholder = "Ask the player something useful";
      prompt.addEventListener("input", () => updateQuestion(index, { label: prompt.value }));
      label.append(prompt);

      const controls = document.createElement("div");
      controls.className = "question-editor-controls";
      const typeLabel = document.createElement("label");
      typeLabel.textContent = "Type";
      const type = document.createElement("select");
      for (const [value, text] of [
        ["text", "Free form"],
        ["select", "Dropdown"],
        ["checkbox", "Checkboxes"],
        ["radio", "Radio buttons"]
      ]) {
        type.append(new Option(text, value));
      }
      type.value = question.type || "text";
      type.addEventListener("change", () => {
        const next = { type: type.value };
        if (type.value === "text") next.options = [];
        else if (!question.options?.length) next.options = ["Option 1", "Option 2"];
        updateQuestion(index, next);
        renderQuestionnaireBuilder();
        renderQuestionnairePreview();
      });
      typeLabel.append(type);

      const required = document.createElement("label");
      required.className = "questionnaire-preview-toggle";
      const requiredInput = document.createElement("input");
      requiredInput.type = "checkbox";
      requiredInput.checked = Boolean(question.required);
      requiredInput.addEventListener("change", () => updateQuestion(index, { required: requiredInput.checked }));
      required.append(requiredInput, document.createTextNode("Required"));
      controls.append(typeLabel, required);

      card.append(top, label, controls);
      if (question.type !== "text") card.append(optionEditor(question, index));
      return card;
    }

    function optionEditor(question, index) {
      const wrap = document.createElement("div");
      wrap.className = "question-options-editor";
      const label = document.createElement("label");
      label.textContent = "Options";
      const textarea = document.createElement("textarea");
      textarea.rows = 4;
      textarea.value = (question.options || []).join("\n");
      textarea.placeholder = "One option per line";
      textarea.addEventListener("input", () => {
        updateQuestion(index, {
          options: textarea.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        });
      });
      label.append(textarea);
      wrap.append(label);
      return wrap;
    }

    function smallButton(text, onClick) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button secondary";
      button.textContent = text;
      button.addEventListener("click", onClick);
      return button;
    }

    function updateQuestion(index, patch) {
      const questions = [...(questionnaireState.questions || [])];
      questions[index] = {
        ...questions[index],
        ...patch,
        updatedAt: new Date().toISOString()
      };
      questionnaireState = { ...questionnaireState, questions };
      renderQuestionnairePreview();
    }

    function moveQuestion(index, delta) {
      const questions = [...(questionnaireState.questions || [])];
      const next = index + delta;
      if (next < 0 || next >= questions.length) return;
      [questions[index], questions[next]] = [questions[next], questions[index]];
      questionnaireState = { ...questionnaireState, questions };
      renderQuestionnaireBuilder();
      renderQuestionnairePreview();
    }

    function removeQuestion(index) {
      const questions = [...(questionnaireState.questions || [])];
      questions.splice(index, 1);
      questionnaireState = { ...questionnaireState, questions };
      renderQuestionnaireBuilder();
      renderQuestionnairePreview();
    }

    function addQuestion() {
      questionnaireState = {
        ...questionnaireState,
        questions: [...(questionnaireState.questions || []), blankQuestion()]
      };
      renderQuestionnaireBuilder();
      renderQuestionnairePreview();
    }

    function draftQuestions() {
      return (questionnaireState.questions || [])
        .map((question) => ({
          ...question,
          label: String(question.label || "").trim(),
          options: question.type === "text" ? [] : [...new Set((question.options || []).map((option) => String(option || "").trim()).filter(Boolean))]
        }))
        .filter((question) => question.label && (question.type === "text" || question.options.length));
    }

    function renderQuestionnairePreview() {
      const card = q("#questionnairePreviewCard");
      const preview = q("#questionnairePreview");
      const toggle = q("#questionnairePreviewToggle");
      if (!card || !preview || !toggle) return;
      card.hidden = !toggle.checked;
      preview.replaceChildren();
      if (!toggle.checked) return;
      const questions = draftQuestions();
      if (!questions.length) {
        const empty = document.createElement("p");
        empty.className = "form-note";
        empty.textContent = "No valid questions to preview yet.";
        preview.append(empty);
        return;
      }
      for (const question of questions) preview.append(renderQuestionnaireField(question));
      const save = document.createElement("button");
      save.type = "button";
      save.className = "button primary";
      save.disabled = true;
      save.textContent = "Save answers";
      preview.append(save);
    }

    function renderQuestionnaireField(question) {
      const wrap = document.createElement("fieldset");
      wrap.className = "questionnaire-question";
      const legend = document.createElement("legend");
      legend.textContent = question.required ? `${question.label} *` : question.label;
      wrap.append(legend);
      if (question.type === "text") {
        const textarea = document.createElement("textarea");
        textarea.rows = 4;
        wrap.append(textarea);
        return wrap;
      }
      if (question.type === "select") {
        const select = document.createElement("select");
        select.append(new Option("Choose one", ""));
        for (const option of question.options || []) select.append(new Option(option, option));
        wrap.append(select);
        return wrap;
      }
      const group = document.createElement("div");
      group.className = "questionnaire-options";
      for (const option of question.options || []) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = question.type;
        input.name = `preview-${question.id}`;
        input.value = option;
        label.append(input, document.createTextNode(option));
        group.append(label);
      }
      wrap.append(group);
      return wrap;
    }

    function renderQuestionnaireResponses() {
      const list = q("#questionnaireResponses");
      const note = q("#questionnaireResponsesNote");
      if (!list) return;
      list.replaceChildren();
      const questions = questionnaireState.questions || [];
      const byId = new Map(questions.map((question) => [question.id, question]));
      const responses = questionnaireState.responses || [];
      if (note) note.textContent = responses.length
        ? `${responses.length} response${responses.length === 1 ? "" : "s"} saved.`
        : "No responses yet.";
      if (!responses.length) {
        const empty = document.createElement("p");
        empty.className = "empty-row";
        empty.textContent = "No responses yet.";
        list.append(empty);
        return;
      }
      for (const response of responses) {
        const row = document.createElement("article");
        row.className = "questionnaire-response-row";
        const title = document.createElement("h3");
        title.textContent = response.handle || response.email || "Unknown";
        const meta = document.createElement("p");
        meta.className = "form-note";
        meta.textContent = response.updatedAt ? `Updated ${new Date(response.updatedAt).toLocaleString()}` : "";
        row.append(title, meta);
        for (const [id, value] of Object.entries(response.answers || {})) {
          const item = document.createElement("p");
          const label = document.createElement("strong");
          label.textContent = byId.get(id)?.label || `Removed question: ${id}`;
          item.append(label, document.createTextNode(` ${formatAnswer(value)}`));
          row.append(item);
        }
        list.append(row);
      }
    }

    function formatAnswer(value) {
      if (Array.isArray(value)) return value.join(", ");
      return String(value || "");
    }

    async function copyAndOpen(text, url, note) {
      await navigator.clipboard.writeText(text);
      window.open(url, "_blank", "noopener,noreferrer");
      note.textContent = "Copied. Paste into the compose window.";
    }

    async function editPost(post) {
      const body = prompt("Updated body", post.body);
      if (body == null) return;
      try {
        const data = await promoteFetch(`/api/admin/promote/posts/${post.id}`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify({ body })
        });
        fillPromote(data.promote);
      } catch (error) {
        q("#postsNote").textContent = error.message;
      }
    }

    async function markFilled(post) {
      try {
        const data = await promoteFetch(`/api/admin/promote/posts/${post.id}`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify({ status: "filled" })
        });
        fillPromote(data.promote);
      } catch (error) {
        q("#postsNote").textContent = error.message;
      }
    }

    async function setPermalink(post) {
      const permalink = prompt("Post URL", post.permalink || "");
      if (permalink == null) return;
      try {
        const data = await promoteFetch(`/api/admin/promote/posts/${post.id}/permalink`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ permalink })
        });
        fillPromote(data.promote);
      } catch (error) {
        q("#postsNote").textContent = error.message;
      }
    }

    async function deletePost(post, forget) {
      if (!confirm(forget ? "Remove this row from the list?" : "Delete the remote post if possible?")) return;
      try {
        const data = await promoteFetch(`/api/admin/promote/posts/${post.id}?forget=${forget ? "1" : "0"}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` }
        });
        fillPromote(data.promote);
      } catch (error) {
        q("#postsNote").textContent = error.message;
      }
    }

    root.querySelectorAll(".admin-tab").forEach((button) => {
      button.addEventListener("click", () => showTab(button.dataset.tab));
    });
    q("#addQuestionnaireQuestion")?.addEventListener("click", addQuestion);
    q("#questionnairePreviewToggle")?.addEventListener("change", renderQuestionnairePreview);
    q("#questionnaireBuilderForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const note = q("#questionnaireBuilderNote");
      if (note) note.textContent = "Saving...";
      try {
        questionnaireState = await promoteFetch("/api/admin/questionnaire", {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({ questions: draftQuestions() })
        });
        renderQuestionnaireBuilder();
        renderQuestionnairePreview();
        renderQuestionnaireResponses();
        if (note) note.textContent = "Questionnaire saved.";
      } catch (error) {
        if (note) note.textContent = error.message;
      }
    });
    q("#questionnaireExport")?.addEventListener("click", async () => {
      const response = await fetch("/api/admin/questionnaire/export.json", {
        headers: { authorization: `Bearer ${token}` }
      });
      const blob = await response.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "amba-questionnaire.json";
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });

    syndicationUrl.addEventListener("input", refreshPreviews);
    playerHookUrl.addEventListener("input", refreshPreviews);
    setLinksEditing(false);
    refreshPreviews();

    async function saveManualWrite() {
      sessionLinksNote.textContent = "Saving…";
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          mode: "write",
          setupSource: "manual",
          title: manualTitle?.value || "",
          playerHookText: manualHook?.value || ""
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const why = data.detail || data.error || response.statusText || String(response.status);
        throw new Error(`Could not save (${why}).`);
      }
      adventureTitle = displayAdventureTitle(data.session?.title) || data.session?.title || adventureTitle;
      if (manualTitle) manualTitle.value = adventureTitle;
      if (manualHook) manualHook.value = data.session?.playerHookText || manualHook.value;
      sessionLinksNote.textContent = "Saved. Signup shows this markdown as the hook and summary.";
    }

    async function saveSessionLinks() {
      sessionLinksNote.textContent = "Saving…";
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          syndicationUrl: syndicationUrl.value,
          playerHookUrl: playerHookUrl.value,
          ...(adventureSelect.dataset.source === "amba" && adventureSelect.value
            ? {
                ambaModuleId: adventureSelect.value,
                title: displayAdventureTitle(ambaModules?.find((module) => module.id === adventureSelect.value)?.title) || undefined
              }
            : {})
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const why = data.detail || data.error || response.statusText || String(response.status);
        throw new Error(`Could not save links (${why}). Re-open admin with +a if this says unauthorized.`);
      }
      syndicationUrl.value = data.session?.syndicationUrl || "";
      playerHookUrl.value = data.session?.playerHookUrl || "";
      adventureTitle = displayAdventureTitle(data.session?.title) || data.session?.title || adventureTitle;
      if (adventureName) adventureName.value = adventureTitle;
      setLinksEditing(setupMode === "manual");
      refreshPreviews();
      syncAdventurePicker();
      sessionLinksNote.textContent = "Links saved. They show as hyperlinks on the signup page.";
    }

    adventureSelect.addEventListener("change", async () => {
      const previous = adventureSelect.dataset.liveId || "";
      const id = adventureSelect.value;
      if (!id || id === previous || adventureSelect.dataset.source !== "amba") return;
      const module = ambaModules?.find((item) => item.id === id);
      applyAmbaModule(module);
      liveAmbaModuleId = id;
      adventureSelect.dataset.liveId = id;
      try {
        await saveSessionLinks();
        sessionLinksNote.textContent = `Bound syndication links from ${displayAdventureTitle(module?.title) || "the selected AMBA module"}.`;
      } catch (error) {
        sessionLinksNote.textContent = error.message;
      }
    });

    q("#connectAmba")?.addEventListener("click", () => connectToAmba());
    q("#refreshAmba")?.addEventListener("click", async () => {
      if (!ambaModules) {
        sessionLinksNote.textContent = "Connect to AMBA first. Refresh needs the AMBA API.";
        return;
      }
      sessionLinksNote.textContent = "Refreshing published modules and syndication…";
      await connectToAmba();
      if (!ambaModules) return;
      try {
        const response = await fetch("/api/admin/session/refresh", {
          method: "POST",
          headers: headers(),
          body: "{}"
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          sessionLinksNote.textContent = data.error || "Could not refresh syndication from the API.";
          return;
        }
        syndicationUrl.value = data.session?.syndicationUrl || syndicationUrl.value;
        playerHookUrl.value = data.session?.playerHookUrl || playerHookUrl.value;
        adventureTitle = displayAdventureTitle(data.session?.title) || data.session?.title || adventureTitle;
        if (adventureName) adventureName.value = adventureTitle;
        refreshPreviews();
        syncAdventurePicker();
        sessionLinksNote.textContent = "Refreshed from the AMBA API and syndication pages.";
      } catch (error) {
        sessionLinksNote.textContent = error.message;
      }
    });
    q("#manualAmba")?.addEventListener("click", () => setSetupMode("manual"));
    q("#writeManual")?.addEventListener("click", () => setSetupMode("write"));
    q("#saveManualWrite")?.addEventListener("click", async () => {
      try {
        await saveManualWrite();
      } catch (error) {
        sessionLinksNote.textContent = error.message;
      }
    });

    sessionLinksToggle.addEventListener("click", async () => {
      if (!linksEditing) {
        setLinksEditing(true);
        syndicationUrl.focus();
        sessionLinksNote.textContent = "Edit the summary and player-hook URLs, then Save.";
        return;
      }
      try {
        await saveSessionLinks();
      } catch (error) {
        sessionLinksNote.textContent = error.message;
      }
    });

    q("#sessionLinksForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (setupMode === "write") {
        try {
          await saveManualWrite();
        } catch (error) {
          sessionLinksNote.textContent = error.message;
        }
        return;
      }
      if (!linksEditing) return;
      try {
        await saveSessionLinks();
      } catch (error) {
        sessionLinksNote.textContent = error.message;
      }
    });

    q("#adminLogout")?.addEventListener("click", () => {
      clearAdminToken();
      delete root.dataset.adminMounted;
      if (options.page) {
        window.location.href = "index.html";
        return;
      }
      options.onLogout?.();
    });
    q("#copyAll").addEventListener("click", async () => {
      await navigator.clipboard.writeText(people.map((person) => person.email).join("; "));
      copyNote.textContent = "Copied as a mail list (semicolon-separated).";
    });

    q("#mailVia").addEventListener("click", () => {
      if (!people.length) return;
      const result = mailDraft();
      if (!result) return;
      copyNote.textContent = result.bccCount
        ? "Opened a mail draft and downloaded amba-yes-invite.eml. Other yes players are on BCC; you are on CC."
        : "Opened a mail draft to you (you are the only yes so far). Also downloaded amba-yes-invite.eml if the mail app did not open.";
    });

    q("#fillFromAdventure").addEventListener("click", async () => {
      const note = q("#templatesNote");
      note.textContent = "Filling…";
      try {
        const state = await (await fetch("/api/state")).json();
        fillPromote({
          ...(promoteState || {}),
          templates: defaultTemplates,
          previews: null
        }, state.session);
        note.textContent = `Filled from ${state.session?.title || "the loaded adventure"}.`;
      } catch (error) {
        note.textContent = error.message;
      }
    });

    q("#templatesForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const note = q("#templatesNote");
      note.textContent = "Saving…";
      try {
        const data = await promoteFetch("/api/admin/promote/templates", {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({
            reddit: {
              title: q("#tplRedditTitle").value,
              body: q("#tplRedditBody").value
            },
            discord: { body: q("#tplDiscordBody").value },
            facebook: { body: q("#tplFacebookBody").value }
          })
        });
        fillPromote(data);
        note.textContent = "Templates saved.";
      } catch (error) {
        note.textContent = error.message;
      }
    });

    q("#saveWebhook").addEventListener("click", async () => {
      const note = q("#discordNote");
      note.textContent = "Saving…";
      try {
        const data = await promoteFetch("/api/admin/promote/settings", {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({
            redditSubreddit: q("#redditSubreddit").value,
            discordWebhookUrl: q("#discordWebhook").value
          })
        });
        fillPromote(data);
        q("#discordWebhook").value = "";
        note.textContent = "Settings saved.";
      } catch (error) {
        note.textContent = error.message;
      }
    });

    q("#redditForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const note = q("#redditNote");
      note.textContent = "Posting…";
      try {
        await promoteFetch("/api/admin/promote/settings", {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({ redditSubreddit: q("#redditSubreddit").value })
        });
        const data = await promoteFetch("/api/admin/promote/post", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            platform: "reddit",
            subreddit: q("#redditSubreddit").value,
            title: q("#redditTitle").value,
            body: q("#redditBody").value
          })
        });
        fillPromote(data.promote);
        note.textContent = data.mode === "posted" ? "Posted to Reddit." : "Copied path — use Copy and open Reddit if you have no API keys.";
      } catch (error) {
        note.textContent = error.message;
      }
    });

    q("#redditCopy").addEventListener("click", async () => {
      const note = q("#redditNote");
      try {
        const data = await promoteFetch("/api/admin/promote/post", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            platform: "reddit",
            copyOnly: true,
            subreddit: q("#redditSubreddit").value,
            title: q("#redditTitle").value,
            body: q("#redditBody").value
          })
        });
        fillPromote(data.promote);
        const text = `${q("#redditTitle").value}\n\n${q("#redditBody").value}`;
        await copyAndOpen(text, data.openUrl, note);
      } catch (error) {
        note.textContent = error.message;
      }
    });

    q("#discordForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const note = q("#discordNote");
      note.textContent = "Posting…";
      try {
        const data = await promoteFetch("/api/admin/promote/post", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            platform: "discord",
            webhookUrl: q("#discordWebhook").value,
            body: q("#discordBody").value
          })
        });
        fillPromote(data.promote);
        q("#discordWebhook").value = "";
        note.textContent = "Posted to Discord.";
      } catch (error) {
        note.textContent = error.message;
      }
    });

    q("#facebookForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const note = q("#facebookNote");
      try {
        const data = await promoteFetch("/api/admin/promote/post", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            platform: "facebook",
            body: q("#facebookBody").value
          })
        });
        fillPromote(data.promote);
        await copyAndOpen(q("#facebookBody").value, data.openUrl, note);
      } catch (error) {
        note.textContent = error.message;
      }
    });


    const titles = {
      yes: ["Emails that said yes", "Open a draft with yes players on BCC so they cannot see each other. You are on CC."],
      setup: ["Setup", "Connect to AMBA, paste syndication links, or write a manual markdown hook for signup."],
      promote: ["Promote", "Push looking-for-players posts. Every template sends people back here to sign up."],
      questionnaire: ["Questionnaire", "Build player questions, preview the form, and review submitted answers."],
      backup: ["Backup", "Save a timestamped JSON snapshot of this site. Restore replaces live data after you confirm."]
    };
    function showTab(name) {
      const tab = titles[name] ? name : "yes";
      const panels = {
        yes: q("#panelYes"),
        setup: q("#panelSetup"),
        promote: q("#panelPromote"),
        questionnaire: q("#panelQuestionnaire"),
        backup: q("#panelBackup")
      };
      Object.entries(panels).forEach(([key, panel]) => {
        if (!panel) return;
        panel.hidden = key !== tab;
      });
      root.querySelectorAll(".admin-tab").forEach((button) => {
        const on = button.dataset.tab === tab;
        button.classList.toggle("is-active", on);
        if (on) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      const heading = q("#adminTitle");
      const lede = q("#adminLede");
      if (heading) heading.textContent = titles[tab][0];
      if (lede) lede.textContent = titles[tab][1];
      history.replaceState(null, "", "#" + tab);
      if (tab === "backup") refreshBackups();
      if (tab === "questionnaire") loadQuestionnaire();
    }
    function formatBackupBytes(bytes) {
      const n = Number(bytes) || 0;
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    }
    function formatBackupWhen(iso) {
      if (!iso) return "";
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return iso;
      return date.toLocaleString();
    }
    function fillBackupGrid(rows) {
      const host = q("#backupGrid");
      if (!host) return;
      const list = Array.isArray(rows) ? rows : [];
      const table = document.createElement("table");
      table.className = "backup-table";
      table.innerHTML = "<thead><tr><th>File name</th><th>Created</th><th>Size</th><th></th></tr></thead>";
      const tbody = document.createElement("tbody");
      if (!list.length) {
        const empty = document.createElement("tr");
        empty.innerHTML = '<td colspan="4" class="backup-empty">No backups yet.</td>';
        tbody.append(empty);
      } else {
        for (const row of list) {
          const tr = document.createElement("tr");
          const name = document.createElement("td");
          name.textContent = row.name || "";
          const created = document.createElement("td");
          created.textContent = formatBackupWhen(row.exportedAt);
          const size = document.createElement("td");
          size.textContent = formatBackupBytes(row.bytes);
          const actions = document.createElement("td");
          actions.className = "backup-actions";
          const restore = document.createElement("button");
          restore.type = "button";
          restore.className = "button secondary";
          restore.textContent = "Restore";
          restore.addEventListener("click", async () => {
            const ok = await (window.askAmbaConfirm
              ? window.askAmbaConfirm(`Overwrite all live AMBA Test data with ${row.name}?`)
              : Promise.resolve(confirm(`Overwrite all live AMBA Test data with ${row.name}?`)));
            if (!ok) return;
            const note = q("#backupNote");
            try {
              await promoteFetch("/api/admin/backups/restore", {
                method: "POST",
                headers: headers(),
                body: JSON.stringify({ name: row.name })
              });
              if (note) note.textContent = "Restored " + row.name;
            } catch (error) {
              if (note) note.textContent = error.message;
            }
          });
          const download = document.createElement("button");
          download.type = "button";
          download.className = "button secondary";
          download.textContent = "Download";
          download.addEventListener("click", async () => {
            const response = await fetch(`/api/admin/backups/file?name=${encodeURIComponent(row.name)}`, {
              headers: { authorization: `Bearer ${token}` }
            });
            const blob = await response.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = row.name;
            document.body.append(a);
            a.click();
            a.remove();
            window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          });
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "button danger";
          remove.textContent = "Delete";
          remove.addEventListener("click", async () => {
            if (!confirm(`Delete ${row.name}?`)) return;
            const note = q("#backupNote");
            try {
              await promoteFetch(`/api/admin/backups/file?name=${encodeURIComponent(row.name)}`, {
                method: "DELETE",
                headers: { authorization: `Bearer ${token}` }
              });
              if (note) note.textContent = "Deleted " + row.name;
              await refreshBackups();
            } catch (error) {
              if (note) note.textContent = error.message;
            }
          });
          actions.append(restore, download, remove);
          tr.append(name, created, size, actions);
          tbody.append(tr);
        }
      }
      table.append(tbody);
      host.replaceChildren(table);
    }
    async function refreshBackups() {
      const note = q("#backupNote");
      if (!q("#backupGrid")?.querySelector("table")) fillBackupGrid([]);
      try {
        const data = await promoteFetch("/api/admin/backups", { headers: { authorization: "Bearer " + token } });
        fillBackupGrid(data.backups || []);
      } catch (error) {
        if (note) note.textContent = error.message;
      }
    }
    fillBackupGrid([]);
    q("#makeBackup")?.addEventListener("click", async () => {
      const note = q("#backupNote");
      if (note) note.textContent = "Saving backup…";
      try {
        const created = await promoteFetch("/api/admin/backups", { method: "POST", headers: headers() });
        if (note) note.textContent = "Saved " + created.name;
        await refreshBackups();
      } catch (error) {
        if (note) note.textContent = error.message;
      }
    });
    q("#restoreFile")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (!(await (window.askAmbaConfirm
        ? window.askAmbaConfirm("Overwrite all live AMBA Test data with this backup JSON?")
        : Promise.resolve(confirm("Overwrite all live AMBA Test data with this backup JSON?"))))) return;
      const note = q("#backupNote");
      try {
        const text = await file.text();
        let payload = {};
        try { payload = JSON.parse(text); } catch { payload = text; }
        await promoteFetch("/api/admin/import", { method: "POST", headers: headers(), body: JSON.stringify(payload) });
        if (note) note.textContent = "Restored from " + file.name;
      } catch (error) {
        if (note) note.textContent = error.message;
      }
    });
    load();
};
