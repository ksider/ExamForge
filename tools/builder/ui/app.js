const ALLOWED_SECTION_IDS = ["listening", "reading", "writing"];
const ALLOWED_PART_TYPES = ["multiple_choice", "gap_fill", "matching", "sentence_insert", "long_text"];

const state = {
  tests: [],
  current: null,
  currentSectionId: "listening",
  currentPartIndex: 0,
  currentQuestionIndex: 0,
  currentScreen: "meta"
};

const el = {
  testsList: document.querySelector("#testsList"),
  sectionTabs: document.querySelector("#sectionTabs"),
  partsList: document.querySelector("#partsList"),
  questionsList: document.querySelector("#questionsList"),
  previewBox: document.querySelector("#previewBox"),
  validationBox: document.querySelector("#validationBox")
};

function emptyTest() {
  return {
    id: `test_${Date.now()}`,
    title: "New Test",
    examType: "general",
    timer: { listening_minutes: 35, reading_minutes: 50, writing_minutes: 45 },
    sections: [
      { id: "listening", title: "Listening", audio: "", parts: [] },
      { id: "reading", title: "Reading", parts: [] },
      { id: "writing", title: "Writing", parts: [] }
    ]
  };
}

function currentSection() {
  return state.current.sections.find((section) => section.id === state.currentSectionId);
}

function currentPart() {
  return currentSection()?.parts[state.currentPartIndex] || null;
}

function currentQuestion() {
  return currentPart()?.questions?.[state.currentQuestionIndex] || null;
}

async function api(path, method = "GET", body) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function loadTests() {
  const data = await api("/api/builder/tests");
  state.tests = data.tests || [];
  renderTests();
}

function renderTests() {
  el.testsList.innerHTML = `
    <button class="test-item" data-new-test>
      <strong>New test</strong>
      <small>Start from an empty template</small>
    </button>
    ${state.tests.map((test) => `
      <button class="test-item" data-load-test="${test.file}">
        <strong>${test.title}</strong>
        <small>${test.file}</small>
      </button>
    `).join("")}
  `;
  el.testsList.querySelector("[data-new-test]").addEventListener("click", () => {
    state.current = emptyTest();
    state.currentSectionId = "listening";
    state.currentPartIndex = 0;
    state.currentQuestionIndex = 0;
    renderAll();
  });
  el.testsList.querySelectorAll("[data-load-test]").forEach((button) => {
    button.addEventListener("click", async () => {
      const loaded = await api(`/api/tests/${encodeURIComponent(button.dataset.loadTest)}`);
      state.current = loaded;
      state.currentSectionId = "listening";
      state.currentPartIndex = 0;
      state.currentQuestionIndex = 0;
      renderAll();
    });
  });
}

function renderSectionTabs() {
  el.sectionTabs.innerHTML = ALLOWED_SECTION_IDS.map((id) => `
    <button class="${id === state.currentSectionId ? "is-active" : ""}" data-section="${id}">${id}</button>
  `).join("");
  el.sectionTabs.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentSectionId = button.dataset.section;
      state.currentPartIndex = 0;
      state.currentQuestionIndex = 0;
      renderAll();
    });
  });
}

function renderScreens() {
  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.screen === state.currentScreen);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === state.currentScreen);
  });
}

function renderMeta() {
  document.querySelectorAll("[data-field]").forEach((input) => {
    const key = input.dataset.field;
    input.value = state.current.timer?.[key] || state.current[key] || "";
    input.oninput = () => {
      if (state.current.timer && key.endsWith("_minutes")) state.current.timer[key] = Number(input.value || 0);
      else state.current[key] = input.value;
      renderPreview();
    };
  });
}

function renderSections() {
  const section = currentSection();
  if (!section) return;
  document.querySelectorAll("[data-section-field]").forEach((input) => {
    input.value = section[input.dataset.sectionField] || "";
    input.oninput = () => {
      section[input.dataset.sectionField] = input.value;
      renderPreview();
    };
  });
}

function renderParts() {
  const section = currentSection();
  if (!section) return;
  el.partsList.innerHTML = section.parts.map((part, index) => `
    <div class="part-item ${index === state.currentPartIndex ? "is-active" : ""}" data-part-index="${index}">
      <strong>${part.title || part.id || part.type}</strong>
      <small>${part.type}</small>
    </div>
  `).join("") || "<p>No parts yet.</p>";
  el.partsList.querySelectorAll("[data-part-index]").forEach((item) => {
    item.addEventListener("click", () => {
      state.currentPartIndex = Number(item.dataset.partIndex);
      state.currentQuestionIndex = 0;
      renderAll();
    });
  });
}

function renderPartEditor() {
  const part = currentPart();
  const inputs = document.querySelectorAll("[data-part-field]");
  inputs.forEach((input) => {
    const key = input.dataset.partField;
    if (!part) {
      input.value = "";
      return;
    }
    if (key === "options") {
      input.value = Array.isArray(part.options) ? part.options.join("\n") : "";
    } else {
      input.value = part[key] ?? "";
    }
    input.oninput = () => {
      if (!part) return;
      if (key === "min_words" || key === "max_words") part[key] = Number(input.value || 0);
      else if (key === "options") part.options = input.value.split("\n").map((line) => line.trim()).filter(Boolean);
      else part[key] = input.value;
      renderPreview();
    };
  });
}

function renderQuestions() {
  const part = currentPart();
  if (!part || part.type === "long_text") {
    el.questionsList.innerHTML = part?.type === "long_text" ? "<p>Writing parts use prompt only.</p>" : "<p>Select a part.</p>";
    return;
  }
  part.questions = Array.isArray(part.questions) ? part.questions : [];
  el.questionsList.innerHTML = part.questions.map((question, index) => `
    <div class="question-item" data-question-index="${index}">
      <label>Number<input data-q-field="number" value="${question.number || ""}" /></label>
      <label>Prompt<textarea data-q-field="prompt">${question.prompt || ""}</textarea></label>
      <label>Correct<input data-q-field="correct" value="${Array.isArray(question.correct) ? question.correct.join(", ") : (question.correct || "")}" /></label>
      <label>Options<textarea data-q-field="options">${Array.isArray(question.options) ? question.options.join("\n") : ""}</textarea></label>
    </div>
  `).join("") || "<p>No questions yet.</p>";
  el.questionsList.querySelectorAll(".question-item").forEach((card) => {
    const question = part.questions[Number(card.dataset.questionIndex)];
    card.querySelectorAll("[data-q-field]").forEach((input) => {
      const key = input.dataset.qField;
      input.oninput = () => {
        if (key === "number") question.number = Number(input.value || 0);
        else if (key === "options") question.options = input.value.split("\n").map((line) => line.trim()).filter(Boolean);
        else question[key] = input.value;
        renderPreview();
      };
    });
  });
}

function renderPreview() {
  el.previewBox.textContent = JSON.stringify(state.current, null, 2);
}

async function validateCurrent() {
  const result = await api("/api/builder/validate", "POST", { test: state.current });
  el.validationBox.textContent = result.valid ? "OK" : result.errors.join("\n");
}

async function saveDraft() {
  await api("/api/builder/save-draft", "POST", { test: state.current });
}

async function importCurrent() {
  await api("/api/builder/import", "POST", { test: state.current });
  await loadTests();
}

function addPart() {
  const section = currentSection();
  if (!section) return;
  section.parts = Array.isArray(section.parts) ? section.parts : [];
  section.parts.push({
    id: `part_${section.parts.length + 1}`,
    title: `Part ${section.parts.length + 1}`,
    type: "multiple_choice",
    questions: []
  });
  state.currentPartIndex = section.parts.length - 1;
  renderAll();
}

function addQuestion() {
  const part = currentPart();
  if (!part || part.type === "long_text") return;
  part.questions = Array.isArray(part.questions) ? part.questions : [];
  part.questions.push({
    number: part.questions.length + 1,
    prompt: "",
    correct: ""
  });
  state.currentQuestionIndex = part.questions.length - 1;
  renderAll();
}

function bindTopbar() {
  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentScreen = button.dataset.screen;
      renderScreens();
      if (state.currentScreen === "preview") renderPreview();
    });
  });
  document.querySelector("[data-action='new']").onclick = () => {
    state.current = emptyTest();
    renderAll();
  };
  document.querySelector("[data-action='duplicate']").onclick = () => {
    state.current = JSON.parse(JSON.stringify(state.current || emptyTest()));
    state.current.id = `${state.current.id || "test"}_copy`;
    renderAll();
  };
  document.querySelector("[data-action='validate']").onclick = validateCurrent;
  document.querySelector("[data-action='save']").onclick = saveDraft;
  document.querySelector("[data-action='import']").onclick = importCurrent;
  document.querySelector("[data-action='add-part']").onclick = addPart;
  document.querySelector("[data-action='add-question']").onclick = addQuestion;
}

function renderAll() {
  if (!state.current) state.current = emptyTest();
  renderSectionTabs();
  renderMeta();
  renderSections();
  renderParts();
  renderPartEditor();
  renderQuestions();
  renderScreens();
  renderPreview();
}

bindTopbar();
loadTests().then(() => {
  state.current = emptyTest();
  renderAll();
});
