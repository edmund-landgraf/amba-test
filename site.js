import { TIMEZONES, timezoneLabel } from "./timezones.js";

let appState = {
  session: null,
  user: null,
  signups: [],
  feedback: [],
  pcs: []
};

let currentEmail = readStored("ambaEmail");
const isQuestionnairePage = location.pathname.endsWith("/questionnaire.html");

const feedbackForm = document.querySelector("#feedbackForm");
const feedbackNote = document.querySelector("#feedbackNote");
const joinTest = document.querySelector("#joinTest");
const closeLogin = document.querySelector("#closeLogin");
const closeProfile = document.querySelector("#closeProfile");
const loginModal = document.querySelector("#loginModal");
const profileModal = document.querySelector("#profileModal");
const identityForm = document.querySelector("#identityForm");
const loginForm = document.querySelector("#loginForm");
const generatedHandle = document.querySelector("#generatedHandle");
const feedbackHandle = document.querySelector("#feedbackHandle");
const profileHandle = document.querySelector("#profileHandle");
const profileEmail = document.querySelector("#profileEmail");
const profileTimezone = document.querySelector("#profileTimezone");
const profileNote = document.querySelector("#profileNote");
const deleteAccount = document.querySelector("#deleteAccount");
const accountButton = document.querySelector("#accountButton");
const accountInitials = document.querySelector("#accountInitials");
const settingsMenu = document.querySelector("#settingsMenu");
const menuHandle = document.querySelector("#menuHandle");
const menuEmail = document.querySelector("#menuEmail");
const menuSettings = document.querySelector("#menuSettings");
const menuTimezone = document.querySelector("#menuTimezone");
const menuProfile = document.querySelector("#menuProfile");
const menuLogin = document.querySelector("#menuLogin");
const menuLogout = document.querySelector("#menuLogout");
const openAdmin = document.querySelector("#openAdmin");
const closeAdmin = document.querySelector("#closeAdmin");
const adminModal = document.querySelector("#adminModal");
const adminForm = document.querySelector("#adminForm");
const adminNote = document.querySelector("#adminNote");
const timezoneModal = document.querySelector("#timezoneModal");
const timezoneForm = document.querySelector("#timezoneForm");
const timezoneSelect = document.querySelector("#timezoneSelect");
const closeTimezone = document.querySelector("#closeTimezone");
const openTimezoneFromProfile = document.querySelector("#openTimezoneFromProfile");
const settingsModal = document.querySelector("#settingsModal");
const settingsForm = document.querySelector("#settingsForm");
const closeSettings = document.querySelector("#closeSettings");
const profileDiscordUserId = document.querySelector("#profileDiscordUserId");
const profileRedditUserId = document.querySelector("#profileRedditUserId");

start();

function readCookie(name) {
  for (const part of String(document.cookie || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return part.slice(index + 1).trim();
    }
  }
  return "";
}

function readStored(key) {
  const cookie = key === "ambaAdminToken" ? readCookie(key) : "";
  if (cookie) return cookie;
  const local = localStorage.getItem(key);
  if (local) {
    sessionStorage.removeItem(key);
    return local;
  }
  const session = sessionStorage.getItem(key);
  if (session) {
    localStorage.setItem(key, session);
    sessionStorage.removeItem(key);
    return session;
  }
  return "";
}

function writeStored(key, value) {
  localStorage.setItem(key, value);
  sessionStorage.removeItem(key);
  if (key === "ambaAdminToken") {
    document.cookie = `${key}=${encodeURIComponent(value)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  }
}

function clearStored(key) {
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
  if (key === "ambaAdminToken") {
    document.cookie = `${key}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}

function askConfirm(message, { title = "Overwrite?", ok = "Overwrite" } = {}) {
  const dialog = document.querySelector("#confirmDialog");
  const copy = document.querySelector("#confirmCopy");
  const heading = document.querySelector("#confirmTitle");
  const okBtn = document.querySelector("#confirmOk");
  const cancelBtn = document.querySelector("#confirmCancel");
  if (!dialog || !copy || !okBtn || !cancelBtn) {
    return Promise.resolve(window.confirm(message));
  }
  if (heading) heading.textContent = title;
  copy.textContent = message;
  okBtn.textContent = ok;
  return new Promise((resolve) => {
    function finish(value) {
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
      resolve(value);
    }
    function onOk() { finish(true); }
    function onCancel(event) {
      event?.preventDefault?.();
      finish(false);
    }
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    dialog.addEventListener("cancel", onCancel);
    dialog.showModal();
  });
}

window.askAmbaConfirm = askConfirm;

async function start() {
  fillTimezoneSelect();
  await loadState();
  wireEvents();
  await renderDiscordPanel();
}

function fillTimezoneSelect(selected = "") {
  if (!timezoneSelect) return;
  timezoneSelect.replaceChildren();
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Choose a time zone";
  timezoneSelect.append(blank);
  for (const zone of TIMEZONES) {
    const option = document.createElement("option");
    option.value = zone.id;
    option.textContent = zone.label;
    timezoneSelect.append(option);
  }
  if (selected && ![...timezoneSelect.options].some((option) => option.value === selected)) {
    const extra = document.createElement("option");
    extra.value = selected;
    extra.textContent = timezoneLabel(selected);
    timezoneSelect.append(extra);
  }
  timezoneSelect.value = selected;
}

async function loadState() {
  appState = await api(`/api/state${currentEmail ? `?email=${encodeURIComponent(currentEmail)}` : ""}`);
  syncIdentity();
  renderAdventureTitle();
  await refreshWgExports();
  renderPcs();
  renderWgSheetList();
  window.dispatchEvent(new CustomEvent("amba-auth", {
    detail: {
      email: currentEmail,
      timezone: appState.user?.timezone || ""
    }
  }));
}

function displayAdventureTitle(value) {
  return String(value || "").replace(/\s*\([^)]*\)\s*$/g, "").replace(/\s+/g, " ").trim();
}

function renderAdventureTitle() {
  const raw = displayAdventureTitle(appState.session?.title);
  const title = !raw || /^(player hook|adventure summary)$/i.test(raw)
    ? "An AMBA Adventure"
    : raw;
  const heading = document.querySelector("#adventureTitle");
  if (heading) heading.textContent = title;
  renderHostedBy();
  const page = location.pathname.split("/").filter(Boolean).pop() || "index.html";
  const suffixes = {
    "index.html": "",
    "videos.html": "Videos",
    "session.html": "Session",
    "discord.html": "Discord",
    "amba.html": "AMBA",
    "wg.html": "WG",
    "upload.html": "Uploads",
    "owlbear.html": "Owlbear",
    "questionnaire.html": "Questionnaire",
    "feedback.html": "Feedback",
    "admin.html": "Admin"
  };
  const suffix = suffixes[page];
  document.title = suffix ? `${title} · ${suffix}` : title;
}

function renderHostedBy() {
  const wrap = document.querySelector("#hostedBy");
  if (!wrap) return;
  const host = appState.session?.discordHost;
  const nameEl = document.querySelector("#hostedByName");
  const frame = document.querySelector("#hostedByFrame");
  const img = document.querySelector("#hostedByImg");
  if (!host?.name) {
    wrap.hidden = true;
    wrap.classList.remove("has-banner");
    if (frame) frame.hidden = true;
    if (img) img.removeAttribute("src");
    return;
  }
  wrap.hidden = false;
  if (nameEl) nameEl.textContent = host.name;
  const fromHost = host.bannerUrl || "";
  const fromHostHalf = host.bannerHalfUrl || "";
  const named = (appState.discordHostChoices || []).find((item) => item.name === host.name);
  const fromChoice = named?.bannerUrl || "";
  const fromChoiceHalf = named?.bannerHalfUrl || "";
  const full = fromHost || fromChoice;
  const half = fromHostHalf || fromChoiceHalf;
  const height = appState.session?.hostedByBannerHeight === "half" ? "half" : "full";
  const bannerUrl = height === "half" ? (half || full) : (full || half);
  const showArt = Boolean(bannerUrl) && appState.session?.displayHostedByBanner !== false;
  wrap.classList.toggle("has-banner", showArt);
  if (frame) frame.hidden = !showArt;
  if (!showArt) {
    if (img) img.removeAttribute("src");
    return;
  }
  if (img) {
    img.alt = "";
    img.src = bannerUrl;
  }
}

function wireEvents() {
  feedbackForm?.addEventListener("submit", saveFeedback);
  identityForm?.addEventListener("submit", saveIdentity);
  settingsForm?.addEventListener("submit", saveSettings);
  document.querySelector("#settingsDownloadExport")?.addEventListener("click", async () => {
    const note = document.querySelector("#settingsBackupNote");
    if (!appState.user?.email) {
      openLoginModal();
      return;
    }
    try {
      const response = await fetch(`/api/export/me?email=${encodeURIComponent(appState.user.email)}`, {
        cache: "no-store"
      });
      const node = await response.json().catch(() => null);
      if (!response.ok || !node || node.error) {
        throw new Error(
          response.status === 404
            ? "Could not export (404). Restart the Node server so /api/export/me is loaded."
            : (node?.detail || node?.error || `Could not export your data (${response.status}).`)
        );
      }
      const blob = new Blob([`${JSON.stringify(node, null, 2)}\n`], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `amba-user-${appState.user.handle || "user"}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      if (note) note.textContent = "Downloaded your JSON node.";
    } catch (error) {
      if (note) note.textContent = error.message;
    }
  });
  document.querySelector("#settingsRestoreFile")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !appState.user?.email) return;
    const ok = await askConfirm(
      "Overwrite your current AMBA Test choices, the slots you added, and your profile with this backup JSON? Other people are not changed."
    );
    if (!ok) return;
    const note = document.querySelector("#settingsBackupNote");
    try {
      const text = await file.text();
      let payload = {};
      try { payload = JSON.parse(text); } catch { payload = {}; }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) payload = {};
      payload.email = appState.user.email;
      const response = await fetch("/api/import/me", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || "Could not restore.");
      if (note) note.textContent = `Restored your choices from ${file.name}`;
      await loadState();
    } catch (error) {
      if (note) note.textContent = error.message;
    }
  });
  settingsModal?.querySelectorAll(".settings-tab").forEach((button) => {
    button.addEventListener("click", () => showSettingsTab(button.dataset.settingsTab));
  });
  document.querySelector("#discordHostSelect")?.addEventListener("change", syncDiscordHostFields);
  loginForm?.addEventListener("submit", login);
  joinTest?.addEventListener("click", joinTheTest);
  openAdmin?.addEventListener("click", openAdminModal);
  closeAdmin?.addEventListener("click", () => {
    adminModal?.close();
    resetAdminModal();
  });
  adminForm?.addEventListener("submit", adminLogin);
  adminForm?.querySelector('input[name="password"]')?.addEventListener("input", () => {
    if (adminNote) adminNote.textContent = "";
  });
  adminModal?.addEventListener("close", resetAdminModal);
  adminModal?.addEventListener("cancel", (event) => {
    event.preventDefault();
  });
  closeLogin?.addEventListener("click", () => {
    pendingTimesScroll = false;
    closeLoginModal();
  });
  closeProfile?.addEventListener("click", closeProfileModal);
  window.addEventListener("amba-need-login", joinTheTest);
  window.addEventListener("amba-need-timezone", () => {
    if (!appState.user?.email) {
      joinTheTest();
      return;
    }
    openTimezoneModal();
  });
  closeTimezone?.addEventListener("click", () => timezoneModal?.open && timezoneModal.close());
  closeSettings?.addEventListener("click", () => {
    settingsModal?.close();
    settingsModal?.classList.remove("admin-shell");
  });
  settingsModal?.addEventListener("close", () => settingsModal.classList.remove("admin-shell"));
  timezoneForm?.addEventListener("submit", saveTimezone);
  timezoneModal?.addEventListener("click", (event) => {
    if (event.target === timezoneModal) timezoneModal.close();
  });
  settingsModal?.addEventListener("click", (event) => {
    if (event.target === settingsModal) settingsModal.close();
  });
  openTimezoneFromProfile?.addEventListener("click", () => {
    closeProfileModal();
    openTimezoneModal();
  });

  loginModal?.addEventListener("click", (event) => {
    if (event.target === loginModal) {
      pendingTimesScroll = false;
      closeLoginModal();
    }
  });
  profileModal?.addEventListener("click", (event) => {
    if (event.target === profileModal) closeProfileModal();
  });

  deleteAccount?.addEventListener("click", deleteProfile);
  accountButton?.addEventListener("click", toggleSettingsMenu);
  menuSettings?.addEventListener("click", () => {
    closeSettingsMenu();
    openSettingsModal();
  });
  menuTimezone?.addEventListener("click", () => {
    closeSettingsMenu();
    openTimezoneModal();
  });
  menuProfile?.addEventListener("click", () => {
    closeSettingsMenu();
    openProfileModal();
  });
  menuLogin?.addEventListener("click", () => {
    closeSettingsMenu();
    joinTheTest();
  });
  menuLogout?.addEventListener("click", () => {
    closeSettingsMenu();
    logout();
  });
  document.addEventListener("click", (event) => {
    if (!settingsMenu || settingsMenu.hidden) return;
    if (!event.target.closest(".account-menu")) closeSettingsMenu();
  });
  document.querySelector("#openUploadLogin")?.addEventListener("click", () => {
    openLoginModal();
  });
  wireWgDrop();
  wireWgSheets();
  wirePcContextMenu();
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some((script) => script.src.includes(src))) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(script);
  });
}

function resetAdminModal() {
  if (!adminModal) return;
  adminModal.classList.remove("admin-shell");
  adminModal.classList.add("small-modal");
  document.querySelector("#adminGate")?.removeAttribute("hidden");
  const host = document.querySelector("#adminAppHost");
  if (host) host.hidden = true;
}

async function openAdminModal() {
  if (!adminModal) return;
  resetAdminModal();
  const input = adminForm?.querySelector('input[name="password"]');
  if (adminNote) adminNote.textContent = "";
  if (input) input.value = "";
  adminModal.showModal();
  if (await restoreAdminSession()) return;
  input?.focus();
}

async function restoreAdminSession() {
  const token = readStored("ambaAdminToken");
  if (!token) return false;
  try {
    const response = await fetch("/api/admin/ok", {
      headers: { authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      clearStored("ambaAdminToken");
      return false;
    }
    writeStored("ambaAdminToken", token);
    if (document.documentElement.dataset.layout === "phone") {
      window.location.href = "admin.html";
      return true;
    }
    await openAdminShell();
    return true;
  } catch {
    return false;
  }
}

async function openAdminShell() {
  const host = document.querySelector("#adminAppHost");
  const gate = document.querySelector("#adminGate");
  if (!host || !adminModal) return;
  adminModal.classList.remove("small-modal");
  adminModal.classList.add("admin-shell");
  gate?.setAttribute("hidden", "");
  host.hidden = false;
  const html = await fetch("admin.html", { cache: "no-store" }).then((response) => response.text());
  const doc = new DOMParser().parseFromString(html, "text/html");
  const main = doc.querySelector("main");
  host.replaceChildren(document.importNode(main, true));
  host.dataset.filled = "1";
  await loadScriptOnce("markdown-toolbar.js");
  await loadScriptOnce("admin.js");
  window.mountAmbaAdmin(host.querySelector("main") || host, {
    onUnauthorized: () => {
      resetAdminModal();
      if (adminNote) adminNote.textContent = "Admin session expired. Enter the password again.";
    },
    onLogout: () => {
      if (host) {
        delete host.dataset.filled;
        host.replaceChildren();
      }
      resetAdminModal();
      adminModal?.close();
    }
  });
}

async function adminLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.querySelector('input[name="password"]');
  const password = String(input?.value || "").trim();
  if (adminNote) adminNote.textContent = "";
  try {
    const result = await api("/api/admin/login", { method: "POST", body: { password } });
    writeStored("ambaAdminToken", result.token);
    if (document.documentElement.dataset.layout === "phone") {
      window.location.href = "admin.html";
      return;
    }
    await openAdminShell();
  } catch {
    if (adminNote) adminNote.textContent = "Wrong password.";
    input?.select();
  }
}

let pendingTimesScroll = false;

function scrollToTimes() {
  pendingTimesScroll = false;
  document.querySelector("#times")?.scrollIntoView({ behavior: "smooth" });
}

function joinTheTest() {
  if (!appState.user?.email) {
    pendingTimesScroll = true;
    openLoginModal();
    return;
  }
  if (!appState.user.timezone) {
    pendingTimesScroll = true;
    openTimezoneModal();
    return;
  }
  scrollToTimes();
}

async function saveIdentity(event) {
  event.preventDefault();
  if (!appState.user?.email) {
    joinTheTest();
    return;
  }
  const data = Object.fromEntries(new FormData(identityForm).entries());
  data.email = appState.user.email;
  data.handle = appState.user.handle;
  data.timezone = appState.user.timezone;
  const result = await api("/api/signup", { method: "POST", body: data });
  appState.user = result.user;
  closeProfileModal();
  await loadState();
}

async function login(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(loginForm).entries());
  const result = await api("/api/login", { method: "POST", body: data });
  currentEmail = result.user.email;
  writeStored("ambaEmail", currentEmail);
  closeLoginModal();
  await loadState();
  if (isQuestionnairePage) return;
  if (!appState.user?.timezone) {
    pendingTimesScroll = true;
    openTimezoneModal();
    return;
  }
  if (pendingTimesScroll) scrollToTimes();
}

async function logout() {
  currentEmail = "";
  clearStored("ambaEmail");
  appState.user = null;
  await loadState();
}

async function saveFeedback(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(feedbackForm).entries());
  await api("/api/feedback", {
    method: "POST",
    body: {
      email: appState.user?.email || "",
      handle: data.handle || appState.user?.handle || "",
      topic: data.topic,
      message: data.message
    }
  });
  feedbackForm.reset();
  feedbackNote.textContent = "Note saved.";
}

async function deleteProfile() {
  if (!appState.user?.email) {
    profileNote.textContent = "Log in to delete your profile.";
    return;
  }

  await api("/api/delete-account", { method: "POST", body: { email: appState.user.email } });
  currentEmail = "";
  clearStored("ambaEmail");
  appState.user = null;
  closeProfileModal();
  await loadState();
}

function syncIdentity() {
  const user = appState.user;
  if (feedbackHandle && user?.handle) feedbackHandle.value = user.handle;
  if (profileHandle) profileHandle.textContent = user?.handle || "Not signed in";
  if (profileEmail) profileEmail.textContent = user?.email || "Not signed in";
  if (profileTimezone) profileTimezone.textContent = user?.timezone ? timezoneLabel(user.timezone) : "Not set";
  if (profileDiscordUserId) profileDiscordUserId.textContent = user?.discordUserId || "Not set";
  if (profileRedditUserId) profileRedditUserId.textContent = user?.redditUserId || "Not set";
  if (accountInitials) accountInitials.textContent = user?.handle ? initialsForHandle(user.handle) : "?";
  if (menuHandle) menuHandle.textContent = user?.handle ? `Welcome, ${user.handle}` : "Not signed in";
  if (menuEmail) menuEmail.textContent = user?.email || "Log in by email";
  if (generatedHandle && user?.handle) generatedHandle.value = user.handle;
  document.body.classList.toggle("is-logged-in", Boolean(user?.email));
}

function openLoginModal() {
  if (!loginModal) return;
  loginModal.showModal();
  loginModal.querySelector("input")?.focus({ preventScroll: true });
}

function closeLoginModal() {
  if (loginModal?.open) loginModal.close();
}

function openProfileModal() {
  if (!profileModal) return;
  syncIdentity();
  if (profileNote) profileNote.textContent = appState.user
    ? "Delete account removes this user, their availability, and their feedback."
    : "Log in by email to view your profile.";
  if (identityForm && appState.user) {
    identityForm.discord.value = appState.user.discord || "";
    if (appState.user.characterStatus) identityForm.characterStatus.value = appState.user.characterStatus;
  }
  profileModal.showModal();
}

function closeProfileModal() {
  if (profileModal?.open) profileModal.close();
}

function openTimezoneModal() {
  if (!timezoneModal) return;
  if (!appState.user?.email) {
    openLoginModal();
    return;
  }
  fillTimezoneSelect(appState.user.timezone || "");
  timezoneModal.showModal();
}

function showSettingsTab(name) {
  const tab = name || "comms";
  settingsModal?.querySelectorAll(".settings-tab").forEach((button) => {
    const on = button.dataset.settingsTab === tab;
    button.classList.toggle("is-active", on);
    if (on) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  settingsModal?.querySelectorAll(".settings-tab-panel").forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== tab;
  });
}

const DISCORD_HOST_MANUAL = "__manual__";

function fillDiscordHostFields() {
  const select = document.querySelector("#discordHostSelect");
  const url = document.querySelector("#discordHostUrl");
  if (!select) return;
  const choices = appState.discordHostChoices || [];
  const host = appState.session?.discordHost;
  select.replaceChildren();
  select.append(new Option("Not set", ""));
  for (const choice of choices) {
    const option = new Option(choice.name, choice.name);
    option.title = choice.desc || "";
    if (choice.bannerUrl) option.dataset.banner = choice.bannerUrl;
    select.append(option);
  }
  select.append(new Option("Enter URL manually", DISCORD_HOST_MANUAL));
  const matched = choices.find((choice) => choice.name === host?.name);
  if (!host?.inviteLink) select.value = "";
  else if (matched) select.value = matched.name;
  else select.value = DISCORD_HOST_MANUAL;
  if (url) url.value = host?.inviteLink || matched?.inviteLink || "";
  syncDiscordHostFields();
}

function syncDiscordHostFields() {
  const select = document.querySelector("#discordHostSelect");
  const url = document.querySelector("#discordHostUrl");
  const desc = document.querySelector("#discordHostDesc");
  const bannerInput = document.querySelector("#discordHostBannerUrl");
  const previewWrap = document.querySelector("#discordHostBannerPreviewWrap");
  const preview = document.querySelector("#discordHostBannerPreview");
  const choices = appState.discordHostChoices || [];
  const name = select?.value || "";
  const choice = choices.find((item) => item.name === name);
  const bannerUrl = choice?.bannerUrl || "";
  if (desc) {
    desc.textContent = choice?.desc
      || (name === DISCORD_HOST_MANUAL ? "Paste a Discord server, channel, or invite URL." : "");
  }
  if (select) select.title = choice?.desc || "";
  if (url) {
    url.readOnly = Boolean(choice);
    if (choice) url.value = choice.inviteLink || "";
  }
  if (bannerInput) bannerInput.value = bannerUrl || "";
  if (preview) {
    if (bannerUrl) preview.src = bannerUrl;
    else preview.removeAttribute("src");
  }
  if (previewWrap) previewWrap.hidden = !bannerUrl;
  window.paintDiscordHostPicker?.(select);
}

async function renderDiscordPanel() {
  const panel = document.querySelector("#discordHostPanel");
  if (!panel) return;
  const host = appState.session?.discordHost;
  const lede = document.querySelector("#discordPageLede");
  const title = document.querySelector("#discordPanelTitle");
  const copy = document.querySelector("#discordPanelCopy");
  const links = document.querySelector("#discordPanelLinks");
  panel.classList.remove("has-widget");
  panel.querySelector(".discord-frame")?.remove();

  if (!host?.inviteLink) {
    if (lede) lede.textContent = "This site is not connected to a Discord server. Pick one in Admin → Discord, or leave Find server to host as a stub.";
    if (title) title.textContent = "Voice and text";
    if (copy) copy.textContent = "No Discord widget, invite, or voice link is loaded from this page.";
    if (links) {
      links.replaceChildren();
      const stub = document.createElement("button");
      stub.type = "button";
      stub.className = "button primary is-stub";
      stub.disabled = true;
      stub.setAttribute("aria-disabled", "true");
      stub.textContent = "Find server to host";
      links.append(stub);
    }
    return;
  }

  if (lede) lede.textContent = host.desc || `Voice and text use ${host.name}.`;
  if (title) title.textContent = host.name;
  let enabled = false;
  if (host.guildId) {
    try {
      const data = await api(`/api/discord-widget?guildId=${encodeURIComponent(host.guildId)}`);
      enabled = Boolean(data.enabled);
    } catch {
      enabled = false;
    }
  }

  if (enabled && host.guildId) {
    if (copy) copy.textContent = host.desc || "In-page Discord widget. Join from the widget if Server Widget is on.";
    if (links) links.replaceChildren();
    panel.classList.add("has-widget");
    const frame = document.createElement("div");
    frame.className = "discord-frame";
    const iframe = document.createElement("iframe");
    iframe.title = `${host.name} Discord widget`;
    iframe.src = `https://discord.com/widget?id=${encodeURIComponent(host.guildId)}&theme=dark`;
    iframe.sandbox = "allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts";
    frame.append(iframe);
    panel.append(frame);
    return;
  }

  if (copy) copy.textContent = "This Discord server is not set up for the in-page bot. Use the link to open it in Discord.";
  if (links) {
    links.replaceChildren();
    const open = document.createElement("a");
    open.className = "button primary";
    open.href = host.inviteLink;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = "Open in Discord";
    links.append(open);
  }
}

function openSettingsModal() {
  if (!settingsModal) return;
  if (!appState.user?.email) {
    openLoginModal();
    return;
  }
  showSettingsTab("comms");
  if (settingsForm) {
    const emailField = settingsForm.querySelector('input[name="email"]');
    if (emailField) emailField.value = appState.user.email || "";
    settingsForm.discordUserId.value = appState.user.discordUserId || "";
    settingsForm.redditUserId.value = appState.user.redditUserId || "";
    const preferred = appState.user.preferredComm || "email";
    const radio = settingsForm.querySelector(`input[name="preferredComm"][value="${preferred}"]`)
      || settingsForm.querySelector('input[name="preferredComm"][value="email"]');
    if (radio) radio.checked = true;
    const desiredField = settingsForm.querySelector('input[name="desiredPlayers"]');
    if (desiredField) desiredField.value = String(appState.session?.targetPlayers || 4);
  }
  fillDiscordHostFields();
  settingsModal.showModal();
  settingsForm?.querySelector('input[name="discordUserId"]')?.focus({ preventScroll: true });
}

async function saveSettings(event) {
  event.preventDefault();
  if (!appState.user?.email) {
    joinTheTest();
    return;
  }
  const data = Object.fromEntries(new FormData(settingsForm).entries());
  const result = await api("/api/signup", {
    method: "POST",
    body: {
      email: appState.user.email,
      handle: appState.user.handle,
      timezone: appState.user.timezone,
      discord: appState.user.discord,
      characterStatus: appState.user.characterStatus,
      discordUserId: data.discordUserId,
      redditUserId: data.redditUserId,
      preferredComm: data.preferredComm
    }
  });
  appState.user = result.user;
  await api("/api/desired-players", {
    method: "POST",
    body: {
      email: appState.user.email,
      desiredPlayers: data.desiredPlayers
    }
  });
  const discordNote = document.querySelector("#settingsDiscordNote");
  try {
    await api("/api/discord-host", {
      method: "POST",
      body: {
        email: appState.user.email,
        name: data.discordHostName,
        url: data.discordHostUrl,
        bannerUrl: data.discordHostBannerUrl || null
      }
    });
    if (discordNote) discordNote.textContent = "";
  } catch {
    if (discordNote) discordNote.textContent = "Could not save the Discord server. Check the URL, or pick a named host.";
    showSettingsTab("discord");
    return;
  }
  if (settingsModal?.open) settingsModal.close();
  await loadState();
  await renderDiscordPanel();
}

async function saveTimezone(event) {
  event.preventDefault();
  if (!appState.user?.email) {
    joinTheTest();
    return;
  }
  const data = Object.fromEntries(new FormData(timezoneForm).entries());
  const result = await api("/api/signup", {
    method: "POST",
    body: {
      email: appState.user.email,
      handle: appState.user.handle,
      timezone: data.timezone,
      discord: appState.user.discord,
      characterStatus: appState.user.characterStatus
    }
  });
  appState.user = result.user;
  if (timezoneModal?.open) timezoneModal.close();
  await loadState();
  if (pendingTimesScroll) scrollToTimes();
}

function partySlotCounts(session = appState.session) {
  let max = Number(session?.maxPartyPcs);
  let play = Number(session?.playPartyPcs);
  let perPlayer = Number(session?.maxPcsPerPlayer);
  max = Number.isFinite(max) && max > 0 ? Math.min(16, Math.round(max)) : 8;
  play = Number.isFinite(play) && play > 0 ? Math.min(16, Math.round(play)) : 4;
  perPlayer = Number.isFinite(perPlayer) && perPlayer > 0 ? Math.min(6, Math.round(perPlayer)) : 2;
  if (play > max) play = max;
  return { maxPartyPcs: max, playPartyPcs: play, maxPcsPerPlayer: perPlayer };
}

function toggleSettingsMenu() {
  if (!settingsMenu || !accountButton) return;
  settingsMenu.hidden = !settingsMenu.hidden;
  accountButton.setAttribute("aria-expanded", String(!settingsMenu.hidden));
}

function closeSettingsMenu() {
  if (!settingsMenu || !accountButton) return;
  settingsMenu.hidden = true;
  accountButton.setAttribute("aria-expanded", "false");
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `Request failed: ${response.status}`);
    error.status = response.status;
    error.code = body.error;
    throw error;
  }
  return response.json();
}

function initialsForHandle(handle) {
  const parts = String(handle || "")
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function renderPcs() {
  const bodies = document.querySelectorAll("#pcsTableBody, #signupPcsBody");
  if (!bodies.length) return;
  const empty = document.querySelector("#pcsEmpty");
  const wrap = document.querySelector(".pcs-table-wrap");
  const slots = partySlotCounts();
  const pcs = (appState.pcs || []).slice(0, slots.maxPartyPcs);
  const slotNote = document.querySelector("#pcsSlotNote");
  if (slotNote) {
    slotNote.textContent = `${pcs.length} / ${slots.maxPartyPcs} listed · ${slots.playPartyPcs} to play · ${slots.maxPcsPerPlayer} per player`;
  }
  if (empty) empty.hidden = pcs.length > 0;
  if (wrap) wrap.hidden = pcs.length === 0;
  for (const body of bodies) {
    body.replaceChildren();
    if (!pcs.length && body.id === "signupPcsBody") {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.className = "status-table-empty";
      const link = document.createElement("a");
      link.href = "wg.html";
      link.textContent = "WG";
      td.append("No public sheets yet. Add yours on ", link, ".");
      tr.append(td);
      body.append(tr);
      continue;
    }
    for (const pc of pcs) {
      body.append(pcRow(pc, { canRemove: body.id === "signupPcsBody" }));
    }
  }
}

function ownsPc(pc) {
  const user = appState.user;
  if (!user?.email) return false;
  const urls = new Set((user.wgSheets || []).map((sheet) => sheet.url));
  if (pc?.url && urls.has(pc.url)) return true;
  return Boolean(user.handle && pc?.handle && user.handle === pc.handle);
}

function closePcContextMenu() {
  const menu = document.querySelector("#pcContextMenu");
  if (menu) menu.hidden = true;
}

function wirePcContextMenu() {
  if (document.querySelector("#pcContextMenu")) return;
  if (!document.querySelector("#signupPcsBody, #wgSheetList")) return;
  const menu = document.createElement("div");
  menu.id = "pcContextMenu";
  menu.className = "schedule-context-menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  const item = document.createElement("button");
  item.type = "button";
  item.setAttribute("role", "menuitem");
  item.textContent = "Remove";
  item.addEventListener("mousedown", (event) => event.preventDefault());
  item.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const url = menu.dataset.url || "";
    const name = menu.dataset.name || "this PC";
    const action = menu.dataset.action || "remove";
    closePcContextMenu();
    if (!url) return;
    window.setTimeout(async () => {
      if (action === "add") {
        await includePartyPc(url, name);
        return;
      }
      const ok = await askConfirm(
        `Remove ${name} from this adventure's party? WG sheet links stay. The table is ${partySlotCounts().maxPartyPcs} max / ${partySlotCounts().playPartyPcs} to play.`,
        {
          title: "Remove from party?",
          ok: "Remove"
        }
      );
      if (ok) await excludePartyPc(url);
    }, 0);
  });
  menu.append(item);
  document.body.append(menu);
  document.addEventListener("mousedown", (event) => {
    if (!menu.contains(event.target)) closePcContextMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePcContextMenu();
  });
  window.addEventListener("scroll", closePcContextMenu, true);
}

function openPcContextMenu(event, pc, action = "remove") {
  event.preventDefault();
  const menu = document.querySelector("#pcContextMenu");
  if (!menu) return;
  const item = menu.querySelector("button");
  menu.dataset.url = pc.url || "";
  menu.dataset.name = pc.name || `Sheet ${pc.id || ""}`.trim() || "this PC";
  menu.dataset.action = action;
  if (item) item.textContent = action === "add" ? "Add to party" : "Remove";
  menu.hidden = false;
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
}

function pcRow(pc, { canRemove = false } = {}) {
  const tr = document.createElement("tr");
  if (canRemove && ownsPc(pc)) {
    tr.classList.add("pc-owned");
    tr.addEventListener("contextmenu", (event) => openPcContextMenu(event, pc, "remove"));
  }
  const hero = document.createElement("td");
  if (pc.imageUrl) {
    const img = document.createElement("img");
    img.className = "pc-portrait";
    img.src = pc.imageUrl;
    img.alt = pc.name ? `${pc.name} portrait` : "Hero portrait";
    hero.append(img);
  } else {
    const ph = document.createElement("span");
    ph.className = "pc-portrait pc-portrait-empty";
    ph.setAttribute("aria-hidden", "true");
    hero.append(ph);
  }
  const name = document.createElement("td");
  const link = document.createElement("a");
  link.href = pc.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = pc.name || `Sheet ${pc.id || ""}`.trim() || "Sheet";
  name.append(link);
  const abc = document.createElement("td");
  abc.textContent = pc.abc || "—";
  const level = document.createElement("td");
  level.textContent = pc.level === "" || pc.level == null ? "—" : String(pc.level);
  const player = document.createElement("td");
  const avatar = document.createElement("span");
  avatar.className = "grid-avatar";
  avatar.title = pc.handle || "";
  avatar.textContent = initialsForHandle(pc.handle);
  player.append(avatar);
  tr.append(hero, name, abc, level, player);
  return tr;
}

function renderWgSheetList() {
  const list = document.querySelector("#wgSheetList");
  if (!list) return;
  list.replaceChildren();
  const sheets = appState.user?.wgSheets || [];
  for (const sheet of sheets) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = sheet.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = sheet.name || sheet.url;
    const meta = document.createElement("span");
    const inParty = sheet.inParty !== false;
    meta.textContent = [
      sheet.abc,
      sheet.level !== "" ? `Lv ${sheet.level}` : "",
      inParty ? "in party" : "not in party"
    ].filter(Boolean).join(" · ");
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => beginEditWgSheet(sheet.url));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "file-remove";
    remove.setAttribute("aria-label", `Delete ${sheet.name || sheet.url}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => deleteWgSheet(sheet.url));
    if (!inParty) {
      item.classList.add("sheet-addable");
      item.addEventListener("contextmenu", (event) => openPcContextMenu(event, sheet, "add"));
    }
    item.append(link, meta, edit, remove);
    list.append(item);
  }
}

function beginEditWgSheet(url) {
  const form = document.querySelector("#wgSheetForm");
  const cancel = document.querySelector("#wgSheetCancel");
  if (!form) return;
  form.url.value = url;
  form.replaceUrl.value = url;
  if (cancel) cancel.hidden = false;
  form.url.focus();
}

function cancelEditWgSheet() {
  const form = document.querySelector("#wgSheetForm");
  const cancel = document.querySelector("#wgSheetCancel");
  if (!form) return;
  form.reset();
  form.replaceUrl.value = "";
  if (cancel) cancel.hidden = true;
}

function wireWgSheets() {
  const form = document.querySelector("#wgSheetForm");
  const cancel = document.querySelector("#wgSheetCancel");
  if (!form) return;
  form.addEventListener("submit", saveWgSheet);
  cancel?.addEventListener("click", cancelEditWgSheet);
}

async function saveWgSheet(event) {
  event.preventDefault();
  const note = document.querySelector("#wgSheetNote");
  if (!appState.user?.email) {
    joinTheTest();
    return;
  }
  const data = Object.fromEntries(new FormData(event.target).entries());
  try {
    const result = await api("/api/wg-sheets", {
      method: "POST",
      body: {
        email: appState.user.email,
        url: data.url,
        replaceUrl: data.replaceUrl
      }
    });
    appState.user = result.user;
    appState.pcs = result.pcs;
    cancelEditWgSheet();
    renderWgSheetList();
    renderPcs();
    if (note) note.textContent = "Saved.";
  } catch (error) {
    if (note) {
      note.textContent = error.code === "sheet_limit"
        ? "Six sheet links max. Delete one before adding another."
        : error.status === 400
        ? "Need a public /sheet/ link on amba or wgui, and Public Character must be on. Six links max."
        : "Could not save that sheet link.";
    }
  }
}

async function includePartyPc(url, name = "this PC") {
  const note = document.querySelector("#wgSheetNote");
  if (!appState.user?.email) return;
  const perPlayer = partySlotCounts().maxPcsPerPlayer;
  const inPartyCount = (appState.user.wgSheets || []).filter((sheet) => sheet.inParty !== false).length;
  if (inPartyCount >= perPlayer) {
    const message = `You already have ${perPlayer} PC${perPlayer === 1 ? "" : "s"} in the party. Remove one from Signup before adding ${name}.`;
    if (note) note.textContent = message;
    window.alert(message);
    return;
  }
  try {
    const result = await api("/api/party-pcs", {
      method: "POST",
      body: { email: appState.user.email, url }
    });
    appState.user = result.user;
    appState.pcs = result.pcs;
    renderWgSheetList();
    renderPcs();
    if (note) note.textContent = `Added ${name} to the party.`;
  } catch (error) {
    const message = error.code === "party_per_player_limit"
      ? `You already have ${perPlayer} PC${perPlayer === 1 ? "" : "s"} in the party. Remove one from Signup before adding another.`
      : "Could not add that PC to the party.";
    if (note) note.textContent = message;
    window.alert(message);
  }
}

async function excludePartyPc(url) {
  if (!appState.user?.email) return;
  try {
    const result = await api(
      `/api/party-pcs?email=${encodeURIComponent(appState.user.email)}&url=${encodeURIComponent(url)}`,
      { method: "DELETE" }
    );
    appState.user = result.user;
    appState.pcs = result.pcs;
    renderWgSheetList();
    renderPcs();
  } catch {
    window.alert("Could not remove that PC from the party.");
  }
}

async function deleteWgSheet(url) {
  const note = document.querySelector("#wgSheetNote");
  if (!appState.user?.email) return;
  const ok = await askConfirm("Remove this sheet link from WG? It will also leave the party list.", {
    title: "Remove sheet link?",
    ok: "Remove"
  });
  if (!ok) return;
  try {
    const result = await api(
      `/api/wg-sheets?email=${encodeURIComponent(appState.user.email)}&url=${encodeURIComponent(url)}`,
      { method: "DELETE" }
    );
    appState.user = result.user;
    appState.pcs = result.pcs;
    cancelEditWgSheet();
    renderWgSheetList();
    renderPcs();
    if (note) note.textContent = "Deleted.";
  } catch {
    if (note) note.textContent = "Could not delete that link.";
  }
}

function wireWgDrop() {
  const drop = document.querySelector("#wgDrop");
  const input = document.querySelector("#wgDropInput");
  if (!drop || !input) return;
  drop.addEventListener("click", (event) => {
    if (!appState.user?.email) {
      event.preventDefault();
      joinTheTest();
    }
  });
  input.addEventListener("change", () => {
    uploadWgFiles(input.files);
    input.value = "";
  });
  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("is-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("is-over");
    if (!appState.user?.email) {
      joinTheTest();
      return;
    }
    uploadWgFiles(event.dataTransfer.files);
  });
}

async function uploadWgFiles(fileList) {
  const note = document.querySelector("#wgDropNote");
  if (!appState.user?.email) {
    joinTheTest();
    return;
  }
  const files = [...fileList || []].filter((file) => /\.json$/i.test(file.name));
  if (!files.length) {
    if (note) note.textContent = "JSON files only.";
    return;
  }
  try {
    let listing = null;
    for (const file of files) {
      const content = await file.text();
      listing = await api("/api/wg-exports", {
        method: "POST",
        body: {
          email: appState.user.email,
          filename: file.name,
          content
        }
      });
    }
    renderWgExports(listing);
    if (note) note.textContent = `Saved. ${listing.usedLabel} of ${listing.capLabel} used.`;
  } catch (error) {
    if (note) {
      note.textContent = String(error.message || "").includes("413")
        ? "File upload space is full."
        : "Could not save that file.";
    }
  }
}

async function refreshWgExports() {
  const list = document.querySelector("#wgFileList");
  if (!list) return;
  if (!appState.user?.email) {
    list.replaceChildren();
    const note = document.querySelector("#wgDropNote");
    if (note) note.textContent = "";
    return;
  }
  try {
    const listing = await api(`/api/wg-exports?email=${encodeURIComponent(appState.user.email)}`);
    renderWgExports(listing);
  } catch {
    list.replaceChildren();
  }
}

function renderWgExports(listing) {
  const list = document.querySelector("#wgFileList");
  const note = document.querySelector("#wgDropNote");
  if (!list || !listing) return;
  list.replaceChildren();
  for (const file of listing.files || []) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `/api/wg-exports/file?name=${encodeURIComponent(file.name)}&email=${encodeURIComponent(appState.user.email)}`;
    link.textContent = file.name;
    const meta = document.createElement("span");
    meta.textContent = [file.handle, formatLocalBytes(file.size)].filter(Boolean).join(" · ");
    item.append(link, meta);
    if (file.mine) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "file-remove";
      remove.setAttribute("aria-label", `Delete ${file.name}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => deleteOwnedWgExport(file.name));
      item.append(remove);
    }
    list.append(item);
  }
  if (note && listing.usedLabel) {
    note.textContent = `${listing.usedLabel} of ${listing.capLabel} used.`;
  }
}

async function deleteOwnedWgExport(name) {
  const note = document.querySelector("#wgDropNote");
  if (!appState.user?.email) return;
  if (!confirm(`Delete ${name}?`)) return;
  try {
    const listing = await api(
      `/api/wg-exports/file?name=${encodeURIComponent(name)}&email=${encodeURIComponent(appState.user.email)}`,
      { method: "DELETE" }
    );
    renderWgExports(listing);
    if (note) note.textContent = `Deleted. ${listing.usedLabel} of ${listing.capLabel} used.`;
  } catch {
    if (note) note.textContent = "Could not delete that file.";
  }
}

function formatLocalBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

