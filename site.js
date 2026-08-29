let appState = {
  session: null,
  user: null,
  signups: [],
  feedback: []
};

const votes = {};
const sessionEmailKey = "ambaWorkflowEmail";

const timeList = document.querySelector("#timeList");
const form = document.querySelector("#signupForm");
const formNote = document.querySelector("#formNote");
const rowsBody = document.querySelector("#signupRows");
const exportCsv = document.querySelector("#exportCsv");
const copyRows = document.querySelector("#copyRows");
const feedbackForm = document.querySelector("#feedbackForm");
const feedbackNote = document.querySelector("#feedbackNote");
const openSignup = document.querySelector("#openSignup");
const openSignupInline = document.querySelector("#openSignupInline");
const openLogin = document.querySelector("#openLogin");
const openLoginInline = document.querySelector("#openLoginInline");
const openProfileInline = document.querySelector("#openProfileInline");
const closeSignup = document.querySelector("#closeSignup");
const closeLogin = document.querySelector("#closeLogin");
const closeProfile = document.querySelector("#closeProfile");
const signupModal = document.querySelector("#signupModal");
const loginModal = document.querySelector("#loginModal");
const profileModal = document.querySelector("#profileModal");
const identityForm = document.querySelector("#identityForm");
const loginForm = document.querySelector("#loginForm");
const generatedHandle = document.querySelector("#generatedHandle");
const rerollHandle = document.querySelector("#rerollHandle");
const currentHandle = document.querySelector("#currentHandle");
const welcomeLine = document.querySelector("#welcomeLine");
const feedbackHandle = document.querySelector("#feedbackHandle");
const loginNote = document.querySelector("#loginNote");
const profileHandle = document.querySelector("#profileHandle");
const profileEmail = document.querySelector("#profileEmail");
const profileRole = document.querySelector("#profileRole");
const profileNote = document.querySelector("#profileNote");
const deleteAccount = document.querySelector("#deleteAccount");
const profileLogin = document.querySelector("#profileLogin");
const adminTimeForm = document.querySelector("#adminTimeForm");
const sessionCount = document.querySelector("#sessionCount");

const adjectives = [
  "Brisk", "Copper", "Clever", "Dusky", "Gentle", "Hidden", "Lucky", "Merry",
  "Nimble", "Quiet", "Rapid", "Silver", "Slippery", "Sturdy", "Velvet", "Witty"
];

const nouns = [
  "Anchor", "Banner", "Beacon", "Beetle", "Candle", "Comet", "Compass", "Ember",
  "Lantern", "Maple", "Orbit", "Pebble", "Quill", "Riddle", "Signal", "Thimble"
];

start();

async function start() {
  await loadState();
  wireEvents();
}

async function loadState() {
  const email = localStorage.getItem(sessionEmailKey) || "";
  appState = await api(`/api/state${email ? `?email=${encodeURIComponent(email)}` : ""}`);
  syncUi();
}

function wireEvents() {
  timeList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-id]");
    if (!button) return;
    votes[button.dataset.id] = button.dataset.value;
    renderTimes();
  });

  form?.addEventListener("submit", saveAvailability);
  feedbackForm?.addEventListener("submit", saveFeedback);
  identityForm?.addEventListener("submit", saveIdentity);
  loginForm?.addEventListener("submit", login);
  adminTimeForm?.addEventListener("submit", addTime);

  openSignup?.addEventListener("click", openSignupModal);
  openSignupInline?.addEventListener("click", openSignupModal);
  openLogin?.addEventListener("click", openLoginModal);
  openLoginInline?.addEventListener("click", openLoginModal);
  openProfileInline?.addEventListener("click", openProfileModal);
  closeSignup?.addEventListener("click", closeSignupModal);
  closeLogin?.addEventListener("click", closeLoginModal);
  closeProfile?.addEventListener("click", closeProfileModal);

  signupModal?.addEventListener("click", (event) => {
    if (event.target === signupModal) closeSignupModal();
  });
  loginModal?.addEventListener("click", (event) => {
    if (event.target === loginModal) closeLoginModal();
  });
  profileModal?.addEventListener("click", (event) => {
    if (event.target === profileModal) closeProfileModal();
  });

  rerollHandle?.addEventListener("click", () => {
    generatedHandle.value = createHandle();
  });

  profileLogin?.addEventListener("click", () => {
    closeProfileModal();
    openLoginModal();
  });

  deleteAccount?.addEventListener("click", deleteProfile);
  exportCsv?.addEventListener("click", () => {
    window.location.href = "/api/export/signups.csv";
  });
  copyRows?.addEventListener("click", copyRowsAsCsv);
}

function syncUi() {
  renderTimes();
  renderRows();
  syncIdentity();
}

function renderTimes() {
  if (!timeList) return;
  const times = appState.session?.times || [];

  if (!times.length) {
    timeList.innerHTML = '<div class="empty-state">No proposed times yet. Add one below, or suggest a time with your availability.</div>';
    return;
  }

  timeList.innerHTML = times.map((time) => {
    const selected = votes[time.id] || "";
    const counts = countVotes(time.title);
    const worksCount = counts.works + (selected === "works" ? 1 : 0);
    const maybeCount = counts.maybe + (selected === "maybe" ? 1 : 0);
    const ready = worksCount >= (appState.session?.targetPlayers || 4) ? " - target met" : "";

    return `
      <article class="time-card">
        <div>
          <strong>${escapeHtml(time.title)}</strong>
          <small>${worksCount} works / ${maybeCount} maybe${ready}<br>${escapeHtml(time.note || "")}</small>
        </div>
        <div class="time-actions" role="group" aria-label="Availability for ${escapeHtml(time.title)}">
          <button class="choice ${selected === "works" ? "active" : ""}" data-id="${time.id}" data-value="works" type="button">Works</button>
          <button class="choice ${selected === "maybe" ? "active" : ""}" data-id="${time.id}" data-value="maybe" type="button">Maybe</button>
          <button class="choice ${selected === "no" ? "active" : ""}" data-id="${time.id}" data-value="no" type="button">No</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderRows() {
  if (!rowsBody) return;
  const signups = appState.signups || [];
  if (!signups.length) {
    rowsBody.innerHTML = '<tr><td colspan="6">No signup rows yet.</td></tr>';
    return;
  }

  rowsBody.innerHTML = signups.map((row) => `
    <tr>
      <td>${escapeHtml(row.handle || "Anonymous")}</td>
      <td>${escapeHtml(row.discord || "")}</td>
      <td>${escapeHtml(row.timezone || "")}</td>
      <td>${escapeHtml(row.role || "")}</td>
      <td>${escapeHtml(row.availability || "")}</td>
      <td>${escapeHtml(row.suggestedTime || "")}</td>
    </tr>
  `).join("");
}

async function saveIdentity(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(identityForm).entries());
  data.handle = normalizeHandle(data.handle || createHandle());
  const result = await api("/api/signup", { method: "POST", body: data });
  appState.user = result.user;
  localStorage.setItem(sessionEmailKey, result.user.email);
  closeSignupModal();
  await loadState();
  formNote.textContent = `Welcome, ${result.user.handle}. Everyone is an admin for now.`;
}

async function login(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(loginForm).entries());
  try {
    const result = await api("/api/login", { method: "POST", body: data });
    appState.user = result.user;
    localStorage.setItem(sessionEmailKey, result.user.email);
    closeLoginModal();
    await loadState();
    formNote.textContent = `Welcome, ${result.user.handle}.`;
  } catch {
    loginNote.textContent = "No signup found for that email yet.";
  }
}

async function addTime(event) {
  event.preventDefault();
  if (!requireUser()) return;
  const data = Object.fromEntries(new FormData(adminTimeForm).entries());
  await api("/api/times", { method: "POST", body: { ...data, email: appState.user.email } });
  adminTimeForm.reset();
  await loadState();
  formNote.textContent = "Proposed time added.";
}

async function saveAvailability(event) {
  event.preventDefault();
  if (!requireUser()) return;

  const data = Object.fromEntries(new FormData(form).entries());
  const namedVotes = {};
  for (const time of appState.session?.times || []) {
    if (votes[time.id]) namedVotes[time.title] = votes[time.id];
  }

  const suggestedTitle = [data.suggestDate, data.suggestTime, data.suggestZone].filter(Boolean).join(" ");
  const suggestedTime = suggestedTitle
    ? { title: suggestedTitle, note: data.suggestNote || "" }
    : null;

  await api("/api/availability", {
    method: "POST",
    body: {
      email: appState.user.email,
      votes: namedVotes,
      suggestedTime,
      notes: data.notes || ""
    }
  });

  form.reset();
  Object.keys(votes).forEach((key) => delete votes[key]);
  await loadState();
  formNote.textContent = "Availability saved. Your email is hidden from the session sheet.";
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
  await loadState();
  feedbackNote.textContent = "Suggestion saved.";
}

async function deleteProfile() {
  if (!appState.user?.email) {
    profileNote.textContent = "Log in to delete your profile.";
    return;
  }

  await api("/api/delete-account", { method: "POST", body: { email: appState.user.email } });
  localStorage.removeItem(sessionEmailKey);
  appState.user = null;
  closeProfileModal();
  await loadState();
  formNote.textContent = "Account deleted.";
}

function requireUser() {
  if (appState.user?.email) return true;
  openSignupModal();
  formNote.textContent = "Sign up or log in first.";
  return false;
}

function countVotes(timeTitle) {
  return (appState.signups || []).reduce((counts, signup) => {
    if (signup.availability?.includes(`${timeTitle}: works`)) counts.works += 1;
    if (signup.availability?.includes(`${timeTitle}: maybe`)) counts.maybe += 1;
    return counts;
  }, { works: 0, maybe: 0 });
}

function syncIdentity() {
  const user = appState.user;
  if (sessionCount) sessionCount.textContent = `${appState.signups?.length || 0} / ${appState.session?.targetPlayers || 4}`;
  if (currentHandle) currentHandle.textContent = user?.handle || "Not joined yet";
  if (welcomeLine) welcomeLine.textContent = user
    ? `Welcome, ${user.handle}. Role: ${user.role}.`
    : "Sign up or log in with your email to recover your handle.";
  if (feedbackHandle && user?.handle) feedbackHandle.value = user.handle;
  if (profileHandle) profileHandle.textContent = user?.handle || "Not signed in";
  if (profileEmail) profileEmail.textContent = user?.email || "Not signed in";
  if (profileRole) profileRole.textContent = user?.role || "Not signed in";
}

function openSignupModal() {
  if (!signupModal) return;
  generatedHandle.value = appState.user?.handle || createHandle();
  signupModal.hidden = false;
  generatedHandle.focus();
}

function closeSignupModal() {
  if (signupModal) signupModal.hidden = true;
}

function openLoginModal() {
  if (!loginModal) return;
  loginModal.hidden = false;
  loginModal.querySelector("input")?.focus();
}

function closeLoginModal() {
  if (loginModal) loginModal.hidden = true;
}

function openProfileModal() {
  if (!profileModal) return;
  syncIdentity();
  if (profileNote) profileNote.textContent = appState.user
    ? "Delete account removes this user, their availability, and their feedback."
    : "Log in by email to view your profile.";
  profileModal.hidden = false;
}

function closeProfileModal() {
  if (profileModal) profileModal.hidden = true;
}

async function copyRowsAsCsv() {
  const rows = appState.signups || [];
  const fields = ["handle", "discord", "timezone", "role", "availability", "suggestedTime"];
  const csv = [fields, ...rows.map((row) => fields.map((field) => row[field] || ""))]
    .map((line) => line.map(csvCell).join(","))
    .join("\n");
  await navigator.clipboard.writeText(csv);
  formNote.textContent = "Signup rows copied as CSV.";
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

function createHandle() {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective}-${noun}`;
}

function normalizeHandle(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

function csvCell(value = "") {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}
