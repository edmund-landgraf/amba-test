const times = [
  { id: "sat-am", title: "Saturday, 1:00 PM Pacific", note: "Good candidate for one longer session", works: 2, maybe: 1 },
  { id: "sun-pm", title: "Sunday, 4:00 PM Pacific", note: "Could work as a shorter first pass", works: 1, maybe: 2 },
  { id: "weeknight", title: "Wednesday, 6:30 PM Pacific", note: "Possible split-session option", works: 0, maybe: 1 }
];

const votes = {};
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
const profileNote = document.querySelector("#profileNote");
const deleteAccount = document.querySelector("#deleteAccount");
const profileLogin = document.querySelector("#profileLogin");

const signupKey = "ambaWorkflowSignups";
const feedbackKey = "ambaWorkflowFeedback";
const identityKey = "ambaWorkflowIdentity";
const profilesKey = "ambaWorkflowProfiles";

const adjectives = [
  "Brisk", "Copper", "Clever", "Dusky", "Gentle", "Hidden", "Lucky", "Merry",
  "Nimble", "Quiet", "Rapid", "Silver", "Slippery", "Sturdy", "Velvet", "Witty"
];

const nouns = [
  "Anchor", "Banner", "Beacon", "Beetle", "Candle", "Comet", "Compass", "Ember",
  "Lantern", "Maple", "Orbit", "Pebble", "Quill", "Riddle", "Signal", "Thimble"
];

function renderTimes() {
  if (!timeList) return;
  timeList.innerHTML = times.map((time) => {
    const selected = votes[time.id] || "";
    const worksCount = time.works + (selected === "works" ? 1 : 0);
    const maybeCount = time.maybe + (selected === "maybe" ? 1 : 0);
    const ready = worksCount >= 4 ? " - target met" : "";

    return `
      <article class="time-card">
        <div>
          <strong>${time.title}</strong>
          <small>${worksCount} works / ${maybeCount} maybe${ready}<br>${time.note}</small>
        </div>
        <div class="time-actions" role="group" aria-label="Availability for ${time.title}">
          <button class="choice ${selected === "works" ? "active" : ""}" data-id="${time.id}" data-value="works" type="button">Works</button>
          <button class="choice ${selected === "maybe" ? "active" : ""}" data-id="${time.id}" data-value="maybe" type="button">Maybe</button>
          <button class="choice ${selected === "no" ? "active" : ""}" data-id="${time.id}" data-value="no" type="button">No</button>
        </div>
      </article>
    `;
  }).join("");
}

timeList?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  votes[button.dataset.id] = button.dataset.value;
  renderTimes();
});

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const identity = getIdentity();
  if (!identity?.handle) {
    openModal();
    formNote.textContent = "Get a handle first, then add your availability.";
    return;
  }

  const data = Object.fromEntries(new FormData(form).entries());
  const signups = getJson(signupKey);
  signups.push({
    handle: identity.handle,
    discord: identity.discord,
    timezone: identity.timezone,
    characterStatus: identity.characterStatus,
    ...data,
    votes: { ...votes },
    createdAt: new Date().toISOString()
  });
  localStorage.setItem(signupKey, JSON.stringify(signups));
  renderRows();
  form.reset();
  formNote.textContent = "Thanks for signing up to play test. Your email stays hidden from the shared session sheet.";
});

renderTimes();

feedbackForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const feedback = getJson(feedbackKey);
  const identity = getIdentity();
  const data = Object.fromEntries(new FormData(feedbackForm).entries());
  data.handle = data.handle || identity?.handle || "";
  feedback.push({ ...identity, ...data, createdAt: new Date().toISOString() });
  localStorage.setItem(feedbackKey, JSON.stringify(feedback));
  feedbackForm.reset();
  syncIdentity();
  feedbackNote.textContent = "Suggestion saved locally. For the live site, this can feed the same sheet or an admin review queue.";
});

openSignup?.addEventListener("click", openModal);
openSignupInline?.addEventListener("click", openModal);
openLogin?.addEventListener("click", openLoginModal);
openLoginInline?.addEventListener("click", openLoginModal);
openProfileInline?.addEventListener("click", openProfileModal);
closeSignup?.addEventListener("click", closeModal);
closeLogin?.addEventListener("click", closeLoginModal);
closeProfile?.addEventListener("click", closeProfileModal);
signupModal?.addEventListener("click", (event) => {
  if (event.target === signupModal) closeModal();
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

identityForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const identity = Object.fromEntries(new FormData(identityForm).entries());
  identity.handle = normalizeHandle(identity.handle || createHandle());
  identity.email = normalizeEmail(identity.email);
  const profiles = getJson(profilesKey).filter((profile) => normalizeEmail(profile.email) !== identity.email);
  profiles.push(identity);
  localStorage.setItem(profilesKey, JSON.stringify(profiles));
  localStorage.setItem(identityKey, JSON.stringify(identity));
  syncIdentity();
  closeModal();
  formNote.textContent = `You are signed up as ${identity.handle}. Use that handle for availability and feedback.`;
});

loginForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = normalizeEmail(new FormData(loginForm).get("email"));
  const profile = getJson(profilesKey).find((item) => normalizeEmail(item.email) === email);
  if (!profile) {
    loginNote.textContent = "No local signup found for that email yet. Join the test to create a handle.";
    return;
  }

  localStorage.setItem(identityKey, JSON.stringify(profile));
  syncIdentity();
  closeLoginModal();
  formNote.textContent = `Welcome, ${profile.handle}. Your email stays hidden from the session sheet.`;
});

profileLogin?.addEventListener("click", () => {
  closeProfileModal();
  openLoginModal();
});

deleteAccount?.addEventListener("click", () => {
  const identity = getIdentity();
  if (!identity?.email) {
    profileNote.textContent = "No signed-in profile to delete.";
    return;
  }

  const email = normalizeEmail(identity.email);
  const handle = identity.handle;
  const profiles = getJson(profilesKey).filter((profile) => normalizeEmail(profile.email) !== email);
  const signups = getJson(signupKey).filter((signup) => signup.handle !== handle);
  const feedback = getJson(feedbackKey).filter((item) => item.handle !== handle && normalizeEmail(item.email) !== email);
  localStorage.setItem(profilesKey, JSON.stringify(profiles));
  localStorage.setItem(signupKey, JSON.stringify(signups));
  localStorage.setItem(feedbackKey, JSON.stringify(feedback));
  localStorage.removeItem(identityKey);
  syncIdentity();
  renderRows();
  profileNote.textContent = "Account deleted from this prototype, including your local signup and feedback rows.";
});

exportCsv?.addEventListener("click", () => {
  const csv = rowsToCsv(getJson(signupKey));
  download("amba-test-signups.csv", csv);
});

copyRows?.addEventListener("click", async () => {
  const csv = rowsToCsv(getJson(signupKey));
  await navigator.clipboard.writeText(csv);
  formNote.textContent = "Signup rows copied as CSV.";
});

function getJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function renderRows() {
  if (!rowsBody) return;
  const signups = getJson(signupKey);
  if (!signups.length) {
    rowsBody.innerHTML = '<tr><td colspan="5">No local signup rows yet.</td></tr>';
    return;
  }

  rowsBody.innerHTML = signups.map((row) => `
    <tr>
      <td>${escapeHtml(row.handle || "Anonymous")}</td>
      <td>${escapeHtml(row.discord || "")}</td>
      <td>${escapeHtml(row.timezone || "")}</td>
      <td>${escapeHtml(formatVotes(row.votes))}</td>
      <td>${escapeHtml(formatSuggestion(row))}</td>
    </tr>
  `).join("");
}

function formatVotes(rowVotes = {}) {
  return Object.entries(rowVotes)
    .map(([id, value]) => `${times.find((time) => time.id === id)?.title || id}: ${value}`)
    .join("; ");
}

function formatSuggestion(row) {
  const parts = [row.suggestDate, row.suggestTime, row.suggestZone].filter(Boolean);
  return parts.length ? `${parts.join(" ")} ${row.suggestNote || ""}`.trim() : "";
}

function rowsToCsv(rows) {
  const header = ["handle", "discord", "timezone", "character_status", "availability", "suggested_time", "notes", "created_at"];
  const body = rows.map((row) => [
    row.handle,
    row.discord,
    row.timezone,
    row.characterStatus,
    formatVotes(row.votes),
    formatSuggestion(row),
    row.notes,
    row.createdAt
  ]);
  return [header, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
}

function csvCell(value = "") {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function download(filename, text) {
  const blob = new Blob([text], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function createHandle() {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective}-${noun}`;
}

function normalizeHandle(value) {
  return String(value)
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getIdentity() {
  try {
    return JSON.parse(localStorage.getItem(identityKey) || "null");
  } catch {
    return null;
  }
}

function syncIdentity() {
  const identity = getIdentity();
  if (currentHandle) currentHandle.textContent = identity?.handle || "Not joined yet";
  if (welcomeLine) welcomeLine.textContent = identity?.handle
    ? `Welcome, ${identity.handle}. Use this handle for this session.`
    : "Sign up or log in with your email to recover your handle.";
  if (feedbackHandle && identity?.handle) feedbackHandle.value = identity.handle;
  if (profileHandle) profileHandle.textContent = identity?.handle || "Not signed in";
  if (profileEmail) profileEmail.textContent = identity?.email || "Not signed in";
}

function openModal() {
  if (!signupModal) return;
  const identity = getIdentity();
  generatedHandle.value = identity?.handle || createHandle();
  signupModal.hidden = false;
  generatedHandle.focus();
}

function closeModal() {
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
  const identity = getIdentity();
  if (profileNote) profileNote.textContent = identity?.handle
    ? "Deleting clears your local profile and current session on this prototype."
    : "Log in by email to view your profile.";
  profileModal.hidden = false;
}

function closeProfileModal() {
  if (profileModal) profileModal.hidden = true;
}

syncIdentity();
renderRows();
