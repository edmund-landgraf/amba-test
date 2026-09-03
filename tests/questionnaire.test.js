const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  coerceQuestionnaire,
  saveResponse,
  validateAnswers,
  mergeUserResponse
} = require("../lib/questionnaire");

const questions = [
  {
    id: "notes",
    type: "text",
    label: "Notes",
    required: true,
    options: []
  },
  {
    id: "role",
    type: "select",
    label: "Role",
    required: true,
    options: ["Front line", "Support"]
  },
  {
    id: "pillars",
    type: "checkbox",
    label: "Pillars",
    required: true,
    options: ["Combat", "Roleplay"]
  },
  {
    id: "voice",
    type: "radio",
    label: "Voice",
    required: true,
    options: ["Yes", "No"]
  }
];

describe("questionnaire", () => {
  it("validates required answers for every question type", () => {
    const missing = validateAnswers(questions, {
      notes: "",
      role: "",
      pillars: [],
      voice: ""
    });
    assert.deepEqual(missing.errors.map((error) => error.id), ["notes", "role", "pillars", "voice"]);

    const filled = validateAnswers(questions, {
      notes: "I like teamwork.",
      role: "Support",
      pillars: ["Combat", "Nope"],
      voice: "Yes"
    });
    assert.deepEqual(filled.errors, []);
    assert.deepEqual(filled.answers, {
      notes: "I like teamwork.",
      role: "Support",
      pillars: ["Combat"],
      voice: "Yes"
    });
  });

  it("saves one editable response per normalized email", () => {
    const initial = { questions, responses: [] };
    const first = saveResponse(initial, {
      email: "PLAYER@Example.COM",
      handle: "First Handle"
    }, {
      notes: "First",
      role: "Support",
      pillars: ["Combat"],
      voice: "Yes"
    }, "2026-09-03T10:00:00.000Z").questionnaire;

    const second = saveResponse(first, {
      email: "player@example.com",
      handle: "Second Handle"
    }, {
      notes: "Updated",
      role: "Front line",
      pillars: ["Roleplay"],
      voice: "No"
    }, "2026-09-03T11:00:00.000Z").questionnaire;

    assert.equal(second.responses.length, 1);
    assert.equal(second.responses[0].email, "player@example.com");
    assert.equal(second.responses[0].handle, "Second-Handle");
    assert.equal(second.responses[0].submittedAt, "2026-09-03T10:00:00.000Z");
    assert.equal(second.responses[0].answers.notes, "Updated");
  });

  it("preserves historical answers when active questions change", () => {
    const initial = {
      questions,
      responses: [
        {
          email: "player@example.com",
          handle: "Old Handle",
          answers: { removed: "old answer", notes: "old notes" },
          submittedAt: "2026-09-03T10:00:00.000Z",
          updatedAt: "2026-09-03T10:00:00.000Z"
        }
      ]
    };
    const changed = { ...initial, questions: questions.slice(0, 1) };
    const result = saveResponse(changed, {
      email: "player@example.com",
      handle: "New Handle"
    }, {
      notes: "new notes"
    }, "2026-09-03T12:00:00.000Z").questionnaire;

    assert.deepEqual(result.responses[0].answers, {
      removed: "old answer",
      notes: "new notes"
    });
  });

  it("coerces junk input into safe arrays", () => {
    assert.deepEqual(coerceQuestionnaire("nope"), { questions: [], responses: [] });
    assert.deepEqual(mergeUserResponse(null, { email: "", answers: {} }), { questions: [], responses: [] });
  });
});
