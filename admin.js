window.mountAmbaAdmin = function mountAmbaAdmin(root, options = {}) {
  const q = (sel) => root.querySelector(sel);
  if (!root || root.dataset.adminMounted === "1") return;
  root.dataset.adminMounted = "1";
  let promoteState = null;
    const token = localStorage.getItem("ambaAdminToken") || sessionStorage.getItem("ambaAdminToken") || "";
    if (token) {
      localStorage.setItem("ambaAdminToken", token);
      sessionStorage.removeItem("ambaAdminToken");
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
    let linksEditing = false;
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

    function fillAdventureSelect(data) {
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
      adventureSelect.dataset.liveId = selectedId;
      adventureSelect.disabled = !adventureSelect.options.length;
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
        if (hash === "promote" || hash === "backup") showTab(hash);
      } catch (error) {
        yesStatus.textContent = error.message || "Could not load yes emails.";
      }
    }

    function fillAdmin(data) {
      selfEmail = data.selfEmail || "";
      slot = data.slot || null;
      adventureTitle = String(data.title || "").trim();
      syndicationUrl.value = data.syndicationUrl || "";
      playerHookUrl.value = data.playerHookUrl || "";
      setLinksEditing(false);
      refreshPreviews();
      render(data.emails || []);
      fillAdventureSelect(data);
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
          playerHookUrl: playerHookUrl.value
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const why = data.detail || data.error || response.statusText || String(response.status);
        throw new Error(`Could not save links (${why}). Re-open admin with +a if this says unauthorized.`);
      }
      syndicationUrl.value = data.session?.syndicationUrl || "";
      playerHookUrl.value = data.session?.playerHookUrl || "";
      setLinksEditing(false);
      refreshPreviews();
      sessionLinksNote.textContent = "Links saved. They show as hyperlinks on the signup page.";
    }

    adventureSelect.addEventListener("change", async () => {
      const previous = adventureSelect.dataset.liveId || "";
      const id = adventureSelect.value;
      if (!id || id === previous) return;
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
      promote: ["Promote", "Push looking-for-players posts. Every template sends people back here to sign up."],
      backup: ["Backup", "Save a timestamped JSON snapshot of this site. Restore replaces live data after you confirm."]
    };
    function showTab(name) {
      const tab = titles[name] ? name : "yes";
      const panels = {
        yes: q("#panelYes"),
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
    async function refreshBackups() {
      const note = q("#backupNote");
      try {
        const data = await promoteFetch("/api/admin/backups", { headers: { authorization: "Bearer " + token } });
        window.mountAmbaBackupGrid?.(q("#backupGrid"), {
          rows: data.backups || [],
          token,
          onChange: refreshBackups
        });
        if (note && !(data.backups || []).length) note.textContent = "No backups yet.";
      } catch (error) {
        if (note) note.textContent = error.message;
      }
    }
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
