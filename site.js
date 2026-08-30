import { TIMEZONES, timezoneLabel } from "./timezones.js";

let appState = {
  session: null,
  user: null,
  signups: [],
  feedback: []
};

let currentEmail = sessionStorage.getItem("ambaEmail") || "";

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

start();

async function start() {
  fillTimezoneSelect();
  await loadState();
  wireEvents();
  wireDiscordVoiceToggles();
  await setupDiscordWidget();
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
  await refreshWgExports();
  window.dispatchEvent(new CustomEvent("amba-auth", {
    detail: {
      email: currentEmail,
      timezone: appState.user?.timezone || ""
    }
  }));
}

function wireEvents() {
  feedbackForm?.addEventListener("submit", saveFeedback);
  identityForm?.addEventListener("submit", saveIdentity);
  loginForm?.addEventListener("submit", login);
  joinTest?.addEventListener("click", joinTheTest);
  openAdmin?.addEventListener("click", () => adminModal?.showModal());
  closeAdmin?.addEventListener("click", () => adminModal?.open && adminModal.close());
  adminForm?.addEventListener("submit", adminLogin);
  adminModal?.addEventListener("click", (event) => {
    if (event.target === adminModal) adminModal.close();
  });
  closeLogin?.addEventListener("click", closeLoginModal);
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
  timezoneForm?.addEventListener("submit", saveTimezone);
  timezoneModal?.addEventListener("click", (event) => {
    if (event.target === timezoneModal) timezoneModal.close();
  });
  openTimezoneFromProfile?.addEventListener("click", () => {
    closeProfileModal();
    openTimezoneModal();
  });

  loginModal?.addEventListener("click", (event) => {
    if (event.target === loginModal) closeLoginModal();
  });
  profileModal?.addEventListener("click", (event) => {
    if (event.target === profileModal) closeProfileModal();
  });

  deleteAccount?.addEventListener("click", deleteProfile);
  accountButton?.addEventListener("click", toggleSettingsMenu);
  menuSettings?.addEventListener("click", () => {
    closeSettingsMenu();
    openTimezoneModal();
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
}

async function adminLogin(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(adminForm).entries());
  try {
    const result = await api("/api/admin/login", { method: "POST", body: data });
    sessionStorage.setItem("ambaAdminToken", result.token);
    window.location.href = "admin.html";
  } catch {
    if (adminNote) adminNote.textContent = "Wrong password.";
  }
}

function joinTheTest() {
  document.querySelector("#times")?.scrollIntoView({ behavior: "smooth" });
  if (!appState.user?.email) {
    openLoginModal();
    return;
  }
  if (!appState.user.timezone) openTimezoneModal();
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
  sessionStorage.setItem("ambaEmail", currentEmail);
  closeLoginModal();
  await loadState();
  document.querySelector("#times")?.scrollIntoView({ behavior: "smooth" });
  if (!appState.user?.timezone) openTimezoneModal();
}

async function logout() {
  currentEmail = "";
  sessionStorage.removeItem("ambaEmail");
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
  feedbackNote.textContent = "Suggestion saved.";
}

async function deleteProfile() {
  if (!appState.user?.email) {
    profileNote.textContent = "Log in to delete your profile.";
    return;
  }

  await api("/api/delete-account", { method: "POST", body: { email: appState.user.email } });
  currentEmail = "";
  sessionStorage.removeItem("ambaEmail");
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
  if (accountInitials) accountInitials.textContent = user?.handle ? initialsForHandle(user.handle) : "?";
  if (menuHandle) menuHandle.textContent = user?.handle ? `Welcome, ${user.handle}` : "Not signed in";
  if (menuEmail) menuEmail.textContent = user?.email || "Log in by email";
  if (generatedHandle && user?.handle) generatedHandle.value = user.handle;
  document.body.classList.toggle("is-logged-in", Boolean(user?.email));
}

function openLoginModal() {
  if (!loginModal) return;
  loginModal.showModal();
  loginModal.querySelector("input")?.focus();
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
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
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

function wireDiscordVoiceToggles() {
  const buttons = document.querySelectorAll(".discord-voice-toggle");
  const on = sessionStorage.getItem("ambaDiscordVoice") === "1";
  for (const button of buttons) {
    setDiscordVoiceState(button, on, false);
    button.addEventListener("click", () => {
      const next = button.getAttribute("aria-pressed") !== "true";
      setDiscordVoiceState(button, next, true);
      sessionStorage.setItem("ambaDiscordVoice", next ? "1" : "0");
    });
  }
}

function setDiscordVoiceState(button, on, openVoice) {
  button.setAttribute("aria-pressed", on ? "true" : "false");
  button.setAttribute("aria-label", on ? "Voice recording on" : "Voice listening");
  const label = button.querySelector(".discord-voice-label");
  if (label) label.textContent = on ? "Record" : "Listen";
  if (on && openVoice && button.dataset.voiceUrl) {
    window.open(button.dataset.voiceUrl, "_blank", "noopener,noreferrer");
  }
}

async function setupDiscordWidget() {
  const frame = document.querySelector(".discord-frame");
  if (!frame) return;
  let enabled = false;
  try {
    const data = await api("/api/discord-widget");
    enabled = Boolean(data.enabled);
  } catch {
    enabled = false;
  }
  if (!enabled) return;
  const fallback = frame.querySelector(".discord-widget-fallback");
  fallback?.remove();
  const iframe = document.createElement("iframe");
  iframe.title = "AMBA Discord server widget";
  iframe.src = "https://discord.com/widget?id=1534196054944121074&theme=dark";
  iframe.sandbox = "allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts";
  frame.prepend(iframe);
}
