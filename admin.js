window.mountAmbaAdmin = function mountAmbaAdmin(root, options = {}) {
  const q = (sel) => root.querySelector(sel);
  if (!root || root.dataset.adminMounted === "1") return;
  root.dataset.adminMounted = "1";
  let promoteState = null;
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
    const sessionLinksToggle = q("#sessionLinksToggle");
    const sessionLinksNote = q("#sessionLinksNote");
    const ambaConnectNote = q("#ambaConnectNote");
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

    function setSetupMode(mode, options = {}) {
      setupMode = mode === "manual" ? "manual" : "connect";
      const wrap = q("#ambaPublishedWrap");
      const connectBtn = q("#connectAmba");
      const manualBtn = q("#manualAmba");
      const isManual = setupMode === "manual";
      if (wrap) wrap.hidden = isManual;
      if (sessionLinksToggle) sessionLinksToggle.hidden = !isManual;
      if (connectBtn) {
        connectBtn.classList.toggle("primary", !isManual);
        connectBtn.classList.toggle("secondary", isManual);
        connectBtn.classList.toggle("is-active", !isManual);
      }
      if (manualBtn) {
        manualBtn.classList.toggle("primary", isManual);
        manualBtn.classList.toggle("secondary", !isManual);
        manualBtn.classList.toggle("is-active", isManual);
      }
      if (isManual) {
        ambaModules = null;
        if (adventureSelect) adventureSelect.dataset.source = "manual";
        setLinksEditing(true);
        const message = "Manual AMBA. Paste the adventure summary and player-hook syndication links, then Save.";
        if (ambaConnectNote) ambaConnectNote.textContent = message;
        if (!options.silent) sessionLinksNote.textContent = message;
        return;
      }
      setLinksEditing(false);
      if (lastAdventureData) fillAdventureSelect(lastAdventureData);
      if (!options.silent && !ambaModules) {
        const message = ambaConnectCopy();
        if (ambaConnectNote) ambaConnectNote.textContent = message;
      }
    }

    function fillAdventureSelect(data) {
      lastAdventureData = data;
      if (setupMode === "manual") return;
      if (ambaModules) {
        fillAmbaModuleSelect(ambaModules, preferredAmbaModule(ambaModules)?.id || "");
        return;
      }
      adventureSelect.replaceChildren();
      const modules = data.modules?.modules || [];
      const selectedId = data.modules?.selectedId || "";
      const fallback = [{
        id: selectedId || "current",
        title: data.title || "An AMBA Adventure",
        live: true
      }];
      for (const module of modules.length ? modules : fallback) {
        const option = document.createElement("option");
        option.value = module.id;
        const mark = module.live || module.id === selectedId ? "" : " (archive)";
        option.textContent = `${module.title || module.id}${mark}`;
        option.selected = module.id === selectedId || (modules.length ? modules.length === 1 : true);
        adventureSelect.append(option);
      }
      adventureSelect.dataset.source = "local";
      adventureSelect.dataset.liveId = selectedId;
      adventureSelect.disabled = !adventureSelect.options.length;
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
        option.textContent = module.title || module.id;
        option.selected = module.id === selectedId;
        adventureSelect.append(option);
      }
      adventureSelect.dataset.source = "amba";
      adventureSelect.dataset.liveId = selectedId || "";
      adventureSelect.disabled = !modules.length;
    }

    function ambaConnectCopy() {
      const origin = ambaApiOrigin();
      const local = /localhost|127\.0\.0\.1/.test(origin);
      return local
        ? `This page talks to AMBA at ${origin} (same browser login as Adventure Maker). Log in there, then try Connect to AMBA again. Or use Manual AMBA to paste the two links.`
        : `This page talks to AMBA at ${origin}, which trusts amba-play and amba-test. Log in to AMBA, then try Connect to AMBA again. Or use Manual AMBA to paste the two links.`;
    }

    function ambaLoginHint(detail) {
      const message = detail || ambaConnectCopy();
      if (ambaConnectNote) ambaConnectNote.textContent = message;
      sessionLinksNote.textContent = message;
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
      if (ambaConnectNote) ambaConnectNote.textContent = `Connecting to AMBA (${origins.join(", ")})…`;
      sessionLinksNote.textContent = `Connecting to AMBA (${origins.join(", ")})…`;
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
          if (lastKind === "auth") {
            ambaLoginHint(`AMBA did not see a logged-in session (${lastOrigin}). Log in at ${origins[0]}/app, then try again.`);
            return;
          }
          ambaLoginHint(`Could not reach AMBA API at /api/modules (not /app) via ${origins.join(" or ")}. Restart Adventure Maker so CORS allows ${location.origin}.`);
          return;
        }
        setSetupMode("connect", { silent: true });
        ambaModules = matched.modules;
        const selected = preferredAmbaModule(matched.modules);
        fillAmbaModuleSelect(matched.modules, selected?.id || "");
        if (selected) applyAmbaModule(selected);
        const message = matched.modules.length
          ? `Connected to ${matched.origin}. ${matched.modules.length} published module${matched.modules.length === 1 ? "" : "s"}.`
          : `Connected to ${matched.origin}, but there are no published modules yet.`;
        if (ambaConnectNote) ambaConnectNote.textContent = message;
        sessionLinksNote.textContent = message;
      } catch {
        ambaModules = null;
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
      refreshPreviews();
      render(data.emails || []);
      fillAdventureSelect(data);
      setSetupMode(setupMode, { silent: true });
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

    syndicationUrl.addEventListener("input", refreshPreviews);
    playerHookUrl.addEventListener("input", refreshPreviews);
    setLinksEditing(false);
    refreshPreviews();

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
                title: ambaModules?.find((module) => module.id === adventureSelect.value)?.title || undefined
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
      setLinksEditing(setupMode === "manual");
      refreshPreviews();
      sessionLinksNote.textContent = "Links saved. They show as hyperlinks on the signup page.";
    }

    adventureSelect.addEventListener("change", async () => {
      const previous = adventureSelect.dataset.liveId || "";
      const id = adventureSelect.value;
      if (!id || id === previous) return;
      if (adventureSelect.dataset.source === "amba") {
        const module = ambaModules?.find((item) => item.id === id);
        applyAmbaModule(module);
        liveAmbaModuleId = id;
        adventureSelect.dataset.liveId = id;
        try {
          await saveSessionLinks();
          sessionLinksNote.textContent = `Bound syndication links from ${module?.title || "the selected AMBA module"}.`;
        } catch (error) {
          sessionLinksNote.textContent = error.message;
        }
        return;
      }
      const ok = await (window.askAmbaConfirm
        ? window.askAmbaConfirm("Make this the live adventure people see? Archives keep their own session rows and votes.", { title: "Switch live adventure?", ok: "Switch" })
        : Promise.resolve(confirm("Make this the live adventure people see?")));
      if (!ok) {
        await load();
        return;
      }
      try {
        await promoteFetch("/api/admin/modules/select", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ id })
        });
        await load();
        sessionLinksNote.textContent = "Live adventure updated.";
      } catch (error) {
        sessionLinksNote.textContent = error.message;
        await load();
      }
    });

    q("#connectAmba")?.addEventListener("click", () => connectToAmba());
    q("#manualAmba")?.addEventListener("click", () => setSetupMode("manual"));

    q("#startNewRun")?.addEventListener("click", async () => {
      const title = String(q("#newRunTitle")?.value || "").trim();
      const ok = await (window.askAmbaConfirm
        ? window.askAmbaConfirm("Start a new adventure file. The current roster is copied. Session rows and votes are not. The current adventure stays on disk as an archive.", { title: "Start new run?", ok: "Start new run" })
        : Promise.resolve(confirm("Start a new run? Roster is copied; votes and session rows are not.")));
      if (!ok) return;
      sessionLinksNote.textContent = "Starting new run…";
      try {
        const data = await promoteFetch("/api/admin/modules/switch", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ title })
        });
        fillAdmin(data);
        await loadPromote();
        if (q("#newRunTitle")) q("#newRunTitle").value = "";
        sessionLinksNote.textContent = `Live adventure is now ${data.adventure?.title || "the new run"}. Previous file kept as archive.`;
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
      setup: ["Setup", "Connect to AMBA and pick a published adventure, or use Manual AMBA and paste the two syndication links."],
      promote: ["Promote", "Push looking-for-players posts. Every template sends people back here to sign up."],
      backup: ["Backup", "Save a timestamped JSON snapshot of this site. Restore replaces live data after you confirm."]
    };
    function showTab(name) {
      const tab = titles[name] ? name : "yes";
      const panels = {
        yes: q("#panelYes"),
        setup: q("#panelSetup"),
        promote: q("#panelPromote"),
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
