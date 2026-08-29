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

const signupKey = "ambaWorkflowSignups";
const feedbackKey = "ambaWorkflowFeedback";

function renderTimes() {
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
  const data = Object.fromEntries(new FormData(form).entries());
  const signups = getJson(signupKey);
  signups.push({ ...data, votes: { ...votes }, createdAt: new Date().toISOString() });
  localStorage.setItem(signupKey, JSON.stringify(signups));
  renderRows();
  form.reset();
  formNote.textContent = "Thanks for signing up to play test. In the future, this step can send a verification email before confirming your spot.";
});

renderTimes();

feedbackForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const feedback = getJson(feedbackKey);
  feedback.push({ ...Object.fromEntries(new FormData(feedbackForm).entries()), createdAt: new Date().toISOString() });
  localStorage.setItem(feedbackKey, JSON.stringify(feedback));
  feedbackForm.reset();
  feedbackNote.textContent = "Suggestion saved locally. For the live site, this can feed the same sheet or an admin review queue.";
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
      <td>${escapeHtml(row.name || "Anonymous")}</td>
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
  const header = ["name", "email", "discord", "timezone", "availability", "suggested_time", "notes", "created_at"];
  const body = rows.map((row) => [
    row.name,
    row.email,
    row.discord,
    row.timezone,
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

renderRows();
