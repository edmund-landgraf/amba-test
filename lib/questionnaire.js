const crypto = require("node:crypto");

const QUESTION_TYPES = new Set(["text", "select", "checkbox", "radio"]);

const defaultQuestionnaire = {
  questions: [
    {
      id: "free-form",
      type: "text",
      label: "What should the GM know before play?",
      required: false,
      options: [],
      createdAt: "",
      updatedAt: ""
    },
    {
      id: "experience",
      type: "select",
      label: "How familiar are you with Pathfinder 2e?",
      required: false,
      options: ["New", "Some experience", "Comfortable", "Very experienced"],
      createdAt: "",
      updatedAt: ""
    },
    {
      id: "interests",
      type: "checkbox",
      label: "What parts of play are you interested in?",
      required: false,
      options: ["Combat", "Exploration", "Roleplay", "Rules testing"],
      createdAt: "",
      updatedAt: ""
    },
    {
      id: "voice-comfort",
      type: "radio",
      label: "Are you comfortable using voice on Discord?",
      required: false,
      options: ["Yes", "Maybe", "No"],
      createdAt: "",
      updatedAt: ""
    }
  ],
  responses: []
};

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
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

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanOption(value) {
  return String(value || "").trim();
}

function uniqueId(used, fallback = "question") {
  let base = String(fallback || "question")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "question";
  let id = base;
  let n = 1;
  while (used.has(id)) {
    n += 1;
    id = `${base}-${n}`;
  }
  used.add(id);
  return id;
}

function coerceQuestion(item, usedIds = new Set(), now = new Date().toISOString()) {
  const raw = asObject(item);
  const type = QUESTION_TYPES.has(raw.type) ? raw.type : "text";
  const label = String(raw.label || "").trim();
  if (!label) return null;
  const id = raw.id
    ? uniqueId(usedIds, raw.id)
    : uniqueId(usedIds, label || crypto.randomUUID());
  const options = type === "text"
    ? []
    : [...new Set(asArray(raw.options).map(cleanOption).filter(Boolean))];
  if (type !== "text" && options.length === 0) return null;
  return {
    id,
    type,
    label,
    required: Boolean(raw.required),
    options,
    createdAt: String(raw.createdAt || now),
    updatedAt: String(raw.updatedAt || now)
  };
}

function coerceQuestions(value, now = new Date().toISOString()) {
  const used = new Set();
  return asArray(value)
    .map((item) => coerceQuestion(item, used, now))
    .filter(Boolean);
}

function coerceAnswerForQuestion(question, value) {
  if (question.type === "checkbox") {
    const selected = asArray(value).map(cleanOption).filter(Boolean);
    const allowed = new Set(question.options);
    return selected.filter((item, index) => allowed.has(item) && selected.indexOf(item) === index);
  }
  const text = cleanOption(value);
  if (!text) return "";
  if (question.type === "select" || question.type === "radio") {
    return question.options.includes(text) ? text : "";
  }
  return text;
}

function answerIsPresent(question, value) {
  if (question.type === "checkbox") return asArray(value).length > 0;
  return cleanOption(value) !== "";
}

function validateAnswers(questions, incoming) {
  const input = asObject(incoming);
  const answers = {};
  const errors = [];
  for (const question of questions) {
    const value = coerceAnswerForQuestion(question, input[question.id]);
    if (answerIsPresent(question, value)) answers[question.id] = value;
    if (question.required && !answerIsPresent(question, value)) {
      errors.push({ id: question.id, message: "required" });
    }
  }
  return { answers, errors };
}

function coerceResponse(item) {
  const raw = asObject(item);
  const email = normalizeEmail(raw.email);
  if (!email) return null;
  return {
    email,
    handle: normalizeHandle(raw.handle) || String(raw.handle || "").trim(),
    answers: asObject(raw.answers),
    submittedAt: String(raw.submittedAt || raw.updatedAt || ""),
    updatedAt: String(raw.updatedAt || raw.submittedAt || "")
  };
}

function coerceQuestionnaire(value) {
  const raw = asObject(value);
  const questions = coerceQuestions(raw.questions);
  const seen = new Set();
  const responses = asArray(raw.responses)
    .map(coerceResponse)
    .filter(Boolean)
    .filter((response) => {
      if (seen.has(response.email)) return false;
      seen.add(response.email);
      return true;
    });
  return { questions, responses };
}

function publicQuestionnaire(value, email = "") {
  const data = coerceQuestionnaire(value);
  const normalized = normalizeEmail(email);
  const response = normalized
    ? data.responses.find((item) => item.email === normalized) || null
    : null;
  return {
    questions: data.questions,
    response: response ? { handle: response.handle, answers: response.answers, submittedAt: response.submittedAt, updatedAt: response.updatedAt } : null
  };
}

function saveResponse(questionnaire, user, incomingAnswers, now = new Date().toISOString()) {
  const data = coerceQuestionnaire(questionnaire);
  const email = normalizeEmail(user?.email);
  if (!email) throw new Error("login_required");
  const checked = validateAnswers(data.questions, incomingAnswers);
  if (checked.errors.length) {
    const error = new Error("questionnaire_invalid");
    error.details = checked.errors;
    throw error;
  }
  const existing = data.responses.find((item) => item.email === email);
  const activeIds = new Set(data.questions.map((question) => question.id));
  const mergedAnswers = { ...(existing?.answers || {}) };
  for (const id of activeIds) delete mergedAnswers[id];
  Object.assign(mergedAnswers, checked.answers);
  const response = {
    email,
    handle: normalizeHandle(user?.handle) || String(user?.handle || "").trim(),
    answers: mergedAnswers,
    submittedAt: existing?.submittedAt || now,
    updatedAt: now
  };
  data.responses = data.responses.filter((item) => item.email !== email);
  data.responses.push(response);
  data.responses.sort((a, b) => a.handle.localeCompare(b.handle) || a.email.localeCompare(b.email));
  return { questionnaire: data, response };
}

function responseForUser(questionnaire, email) {
  const normalized = normalizeEmail(email);
  return coerceQuestionnaire(questionnaire).responses.find((item) => item.email === normalized) || null;
}

function mergeUserResponse(questionnaire, response) {
  const data = coerceQuestionnaire(questionnaire);
  const row = coerceResponse(response);
  if (!row) return data;
  data.responses = data.responses.filter((item) => item.email !== row.email);
  data.responses.push(row);
  data.responses.sort((a, b) => a.handle.localeCompare(b.handle) || a.email.localeCompare(b.email));
  return data;
}

module.exports = {
  defaultQuestionnaire,
  QUESTION_TYPES,
  coerceQuestionnaire,
  coerceQuestions,
  publicQuestionnaire,
  validateAnswers,
  saveResponse,
  responseForUser,
  mergeUserResponse,
  normalizeEmail
};
