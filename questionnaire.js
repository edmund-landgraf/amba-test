(function mountQuestionnairePage() {
  const form = document.querySelector("#questionnaireForm");
  const fields = document.querySelector("#questionnaireFields");
  const note = document.querySelector("#questionnaireNote");
  const login = document.querySelector("#questionnaireLogin");
  const empty = document.querySelector("#questionnaireEmpty");
  const loginButton = document.querySelector("#questionnaireLoginButton");
  const handleNode = document.querySelector("#questionnaireHandle");
  if (!form || !fields) return;

  let email = readStored("ambaEmail");
  let userHandle = "";
  let questions = [];
  let response = null;

  loginButton?.addEventListener("click", () => {
    document.querySelector("#loginModal")?.showModal();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!email) {
      document.querySelector("#loginModal")?.showModal();
      return;
    }
    const answers = collectAnswers();
    try {
      const saved = await api("/api/questionnaire/response", {
        method: "POST",
        body: { email, answers }
      });
      response = saved.response;
      render();
      if (note) note.textContent = response?.submittedAt === response?.updatedAt ? "Answers saved." : "Answers updated.";
    } catch (error) {
      if (note) note.textContent = error.message.includes("400")
        ? "Please answer every required question."
        : "Could not save your answers.";
    }
  });

  window.addEventListener("amba-auth", (event) => {
    email = event.detail?.email || readStored("ambaEmail");
    userHandle = document.querySelector("#menuHandle")?.textContent?.replace(/^Welcome,\s*/, "") || "";
    load();
  });

  load();

  async function load() {
    email = readStored("ambaEmail");
    try {
      const url = `/api/questionnaire${email ? `?email=${encodeURIComponent(email)}` : ""}`;
      const data = await api(url);
      questions = data.questions || [];
      response = data.response || null;
      userHandle = response?.handle || userHandle;
      render();
    } catch {
      if (note) note.textContent = "Could not load the questionnaire.";
    }
  }

  function render() {
    login.hidden = Boolean(email);
    form.hidden = !email || !questions.length;
    empty.hidden = !email || questions.length > 0;
    fields.replaceChildren();
    if (!email || !questions.length) return;
    if (handleNode) {
      const label = response?.handle || userHandle || "your handle";
      handleNode.textContent = `Saving as ${label}`;
    }
    for (const question of questions) {
      fields.append(renderQuestion(question, response?.answers?.[question.id]));
    }
  }

  function renderQuestion(question, answer) {
    const wrap = document.createElement("fieldset");
    wrap.className = "questionnaire-question";
    wrap.dataset.questionId = question.id;
    wrap.dataset.questionType = question.type;
    const legend = document.createElement("legend");
    legend.textContent = question.required ? `${question.label} *` : question.label;
    wrap.append(legend);

    if (question.type === "text") {
      const textarea = document.createElement("textarea");
      textarea.name = question.id;
      textarea.rows = 4;
      textarea.required = Boolean(question.required);
      textarea.value = typeof answer === "string" ? answer : "";
      wrap.append(textarea);
      return wrap;
    }

    if (question.type === "select") {
      const select = document.createElement("select");
      select.name = question.id;
      select.required = Boolean(question.required);
      select.append(new Option("Choose one", ""));
      for (const option of question.options || []) {
        select.append(new Option(option, option));
      }
      select.value = typeof answer === "string" ? answer : "";
      wrap.append(select);
      return wrap;
    }

    const selected = new Set(Array.isArray(answer) ? answer : [answer].filter(Boolean));
    const group = document.createElement("div");
    group.className = "questionnaire-options";
    for (const option of question.options || []) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = question.type;
      input.name = question.id;
      input.value = option;
      input.checked = selected.has(option);
      label.append(input, document.createTextNode(option));
      group.append(label);
    }
    wrap.append(group);
    return wrap;
  }

  function collectAnswers() {
    const answers = {};
    for (const question of questions) {
      if (question.type === "checkbox") {
        answers[question.id] = [...form.querySelectorAll(`input[name="${cssEscape(question.id)}"]:checked`)].map((item) => item.value);
      } else if (question.type === "radio") {
        answers[question.id] = form.querySelector(`input[name="${cssEscape(question.id)}"]:checked`)?.value || "";
      } else {
        answers[question.id] = form.elements[question.id]?.value || "";
      }
    }
    return answers;
  }

  function readStored(key) {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || "";
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

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(value);
    return String(value).replace(/"/g, '\\"');
  }
})();
