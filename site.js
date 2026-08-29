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
const closeSignup = document.querySelector("#closeSignup");
const signupModal = document.querySelector("#signupModal");
const identityForm = document.querySelector("#identityForm");
const generatedHandle = document.querySelector("#generatedHandle");
const rerollHandle = document.querySelector("#rerollHandle");
const currentHandle = document.querySelector("#currentHandle");
const feedbackHandle = document.querySelector("#feedbackHandle");

const signupKey = "ambaWorkflowSignups";
const feedbackKey = "ambaWorkflowFeedback";
const identityKey = "ambaWorkflowIdentity";

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
  signups.push({ ...identity, ...data, votes: { ...votes }, createdAt: new Date().toISOString() });
  localStorage.setItem(signupKey, JSON.stringify(signups));
  renderRows();
  form.reset();
  formNote.textContent = "Thanks for signing up to play test. In the future, this step can send a verification email before confirming your spot.";
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
closeSignup?.addEventListener("click", closeModal);
signupModal?.addEventListener("click", (event) => {
  if (event.target === signupModal) closeModal();
});

rerollHandle?.addEventListener("click", () => {
  generatedHandle.value = createHandle();
});

identityForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const identity = Object.fromEntries(new FormData(identityForm).entries());
  identity.handle = normalizeHandle(identity.handle || createHandle());
  localStorage.setItem(identityKey, JSON.stringify(identity));
  syncIdentity();
  closeModal();
  formNote.textContent = `You are signed up as ${identity.handle}. Use that handle for availability and feedback.`;
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
  const header = ["handle", "email", "discord", "timezone", "character_status", "availability", "suggested_time", "notes", "created_at"];
  const body = rows.map((row) => [
    row.handle,
    row.email,
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
  if (feedbackHandle && identity?.handle) feedbackHandle.value = identity.handle;
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

syncIdentity();
renderRows();
