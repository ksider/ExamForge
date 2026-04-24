const appState = {
  tests: [],
  selectedFile: null,
  loadedFile: null,
  progressKey: null,
  test: null,
  activeSectionId: null,
  answers: {},
  checked: {},
  sectionScores: {},
  selectedDragValue: null,
  timer: {
    intervalId: null,
    startedAt: null,
    accumulatedSeconds: 0,
    remainingSeconds: 0,
    elapsedSeconds: 0,
    limitSeconds: 0,
    isPaused: false,
    restoreOnStart: false,
    savedState: null,
    audioStates: {},
    locked: false
  }
};

const dom = {
  startScreen: document.querySelector("#startScreen"),
  examScreen: document.querySelector("#examScreen"),
  resultsScreen: document.querySelector("#resultsScreen"),
  testsList: document.querySelector("#testsList"),
  refreshTests: document.querySelector("#refreshTests"),
  startBtn: document.querySelector("#startBtn"),
  timerPanel: document.querySelector("#timerPanel"),
  sectionTabs: document.querySelector("#sectionTabs"),
  examContent: document.querySelector("#examContent"),
  resultsContent: document.querySelector("#resultsContent"),
  resultSubtitle: document.querySelector("#resultSubtitle"),
  resultHistory: document.querySelector("#resultHistory"),
  topbarExitBtn: document.querySelector("#topbarExitBtn"),
  restartBtn: document.querySelector("#restartBtn")
};

function getTimerMode() {
  return document.querySelector("input[name='timerMode']:checked").value;
}

function getTimerScope() {
  return document.querySelector("input[name='timerScope']:checked").value;
}

function storageKey() {
  return appState.progressKey || defaultProgressKey();
}

function progressModeKey(mode = getTimerMode()) {
  return mode || "exam";
}

function defaultProgressKey(testId = appState.test?.id, mode = getTimerMode()) {
  return testId ? `examforge:progress:${testId}:${progressModeKey(mode)}` : null;
}

function newProgressKey(testId = appState.test?.id, mode = getTimerMode()) {
  return testId ? `examforge:progress:${testId}:${progressModeKey(mode)}:${Date.now()}` : null;
}

function activeProgressStorageKey(testId = appState.test?.id, mode = getTimerMode()) {
  return testId ? `examforge:active-progress:${testId}:${progressModeKey(mode)}` : null;
}

function timerStorageKey(testId = appState.test?.id, mode = getTimerMode(), sectionId = appState.activeSectionId) {
  if (!testId) return null;
  const scope = getTimerScope();
  const sectionPart = scope === "section" ? `:${sectionId || "section"}` : "";
  return `examforge:timer:${testId}:${progressModeKey(mode)}:${scope}${sectionPart}`;
}

function saveActiveProgressKey() {
  const key = activeProgressStorageKey(appState.test?.id, getTimerMode());
  if (key && appState.progressKey) sessionStorage.setItem(key, appState.progressKey);
}

function loadActiveProgressKey(testId = appState.test?.id, mode = getTimerMode()) {
  const key = activeProgressStorageKey(testId, mode);
  return key ? sessionStorage.getItem(key) : null;
}

function resultsStorageKey() {
  return "examforge:results";
}

function answerKey(sectionId, questionNumber) {
  return `${sectionId}:${questionNumber}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", "&#10;");
}

function normalizeAnswer(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function wordCount(text) {
  const words = String(text || "").trim().match(/[A-Za-zА-Яа-яЁё0-9]+(?:[-'][A-Za-zА-Яа-яЁё0-9]+)?/g);
  return words ? words.length : 0;
}

function getSectionLimitMinutes(section) {
  const timer = appState.test?.timer || {};
  return Number(timer[`${section.id}_minutes`] || section.time_minutes || 0);
}

function getTotalLimitSeconds() {
  return appState.test.sections.reduce((sum, section) => sum + getSectionLimitMinutes(section) * 60, 0);
}

function isCurrentTestCompleted() {
  if (!appState.test?.sections?.length) return false;
  return appState.test.sections.every((section) => Boolean(appState.checked[section.id]));
}

function saveProgress() {
  const key = storageKey();
  if (!key) return;
  saveActiveProgressKey();
  const timerSnapshot = getTimerSnapshot();
  appState.timer.savedState = timerSnapshot;
  saveTimerSnapshot(timerSnapshot);
  localStorage.setItem(
    key,
    JSON.stringify({
      answers: appState.answers,
      checked: appState.checked,
      sectionScores: appState.sectionScores,
      activeSectionId: appState.activeSectionId,
      timer: timerSnapshot,
      audioStates: appState.timer.audioStates,
      testId: appState.test.id,
      testTitle: appState.test.title,
      file: appState.selectedFile,
      updatedAt: new Date().toISOString()
    })
  );
}

function saveTimerSnapshot(snapshot = getTimerSnapshot()) {
  if (!snapshot || !appState.test) return;
  const testId = appState.test.id;
  const mode = snapshot.mode || getTimerMode();
  const scope = snapshot.scope || getTimerScope();

  if (scope === "section") {
    const sectionId = snapshot.sectionId || appState.activeSectionId;
    const key = timerStorageKey(testId, mode, sectionId);
    if (key) {
      localStorage.setItem(key, JSON.stringify({ ...snapshot, sectionId }));
    }
    return;
  }

  const key = timerStorageKey(testId, mode);
  if (key) localStorage.setItem(key, JSON.stringify(snapshot));
}

function loadTimerSnapshot(sectionId = appState.activeSectionId) {
  if (!appState.test) return null;
  const mode = getTimerMode();
  const scope = getTimerScope();
  const key = timerStorageKey(appState.test.id, mode, sectionId);
  if (!key) return null;

  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.mode === mode && parsed.scope === scope) return parsed;
    } catch {
      localStorage.removeItem(key);
    }
  }

  if (scope === "section") return null;

  const rootKey = timerStorageKey(appState.test.id, mode);
  const rootRaw = rootKey ? localStorage.getItem(rootKey) : null;
  if (!rootRaw) return null;
  try {
    const parsed = JSON.parse(rootRaw);
    if (parsed && parsed.mode === mode && parsed.scope === scope) return parsed;
  } catch {
    localStorage.removeItem(rootKey);
  }
  return null;
}

function getTimerSnapshot() {
  if (!appState.test) return null;
  if (appState.timer.remainingSeconds === 0 && appState.timer.elapsedSeconds === 0 && appState.timer.limitSeconds === 0) return null;

  return {
    mode: getTimerMode(),
    scope: getTimerScope(),
    sectionId: appState.activeSectionId,
    elapsedSeconds: appState.timer.elapsedSeconds,
    remainingSeconds: appState.timer.remainingSeconds,
  };
}

function loadProgress(progressKey = storageKey()) {
  const key = progressKey;
  if (!key) return;
  const raw = localStorage.getItem(key);
  if (!raw) return;

  try {
    const saved = JSON.parse(raw);
    appState.progressKey = key;
    appState.answers = saved.answers || {};
    appState.checked = saved.checked || {};
    appState.sectionScores = saved.sectionScores || {};
    appState.activeSectionId = saved.activeSectionId || appState.activeSectionId;
    appState.timer.savedState = saved.timer || null;
    appState.timer.audioStates = saved.audioStates || {};
    appState.timer.restoreOnStart = Boolean(saved.timer);
  } catch {
    localStorage.removeItem(key);
  }
}

function resetRuntimeState() {
  appState.answers = {};
  appState.checked = {};
  appState.sectionScores = {};
  appState.activeSectionId = null;
  appState.progressKey = null;
  appState.timer.startedAt = null;
  appState.timer.remainingSeconds = 0;
  appState.timer.elapsedSeconds = 0;
  appState.timer.limitSeconds = 0;
  appState.timer.isPaused = false;
  appState.timer.restoreOnStart = false;
  appState.timer.savedState = null;
  appState.timer.audioStates = {};
  appState.timer.locked = false;
}

function appBasePath() {
  const pathname = window.location.pathname;
  const routeIndex = pathname.indexOf("/test/");
  if (routeIndex >= 0) return pathname.slice(0, routeIndex);

  const cleanPath = pathname.replace(/\/+$/, "");
  if (!cleanPath || cleanPath === "/") return "";
  if (/\.[^/]+$/.test(cleanPath)) {
    const lastSlash = cleanPath.lastIndexOf("/");
    return lastSlash > 0 ? cleanPath.slice(0, lastSlash) : "";
  }
  return cleanPath;
}

function routePath(path) {
  const base = appBasePath();
  const cleanPath = `/${String(path || "").replace(/^\/+/, "")}`;
  return `${base}${cleanPath}` || "/";
}

function buildExamPath(file, sectionId = appState.activeSectionId) {
  return routePath(`/test/${encodeURIComponent(file)}/section/${encodeURIComponent(sectionId || "")}`);
}

function buildResultsPath(file) {
  return routePath(`/test/${encodeURIComponent(file)}/results`);
}

function updateRoute(path, options = {}) {
  const shouldSave = options.save !== false;
  if (window.location.protocol === "file:") return;
  if (shouldSave) saveProgress();
  if (window.location.pathname !== path) {
    history.pushState({}, "", path);
  }
}

function staticAssetPath(path) {
  if (window.location.protocol === "file:") return path.replace(/^\/+/, "");
  return routePath(path);
}

function resolveMediaPath(path) {
  if (!appState.staticMode || !path.startsWith("/")) return path;
  return staticAssetPath(path);
}

function showStartScreen(push = true) {
  window.clearInterval(appState.timer.intervalId);
  dom.timerPanel.classList.add("is-hidden");
  dom.topbarExitBtn.classList.add("is-hidden");
  dom.examScreen.classList.add("is-hidden");
  dom.resultsScreen.classList.add("is-hidden");
  dom.startScreen.classList.remove("is-hidden");
  document.querySelector("main").classList.remove("is-wide");
  if (push) updateRoute(routePath("/"));
}

function showExamScreen() {
  dom.startScreen.classList.add("is-hidden");
  dom.resultsScreen.classList.add("is-hidden");
  dom.examScreen.classList.remove("is-hidden");
  dom.topbarExitBtn.classList.remove("is-hidden");
}

function parseRoute() {
  const base = appBasePath();
  const routePathname = base && window.location.pathname.startsWith(base)
    ? window.location.pathname.slice(base.length)
    : window.location.pathname;
  const parts = routePathname.split("/").filter(Boolean);
  if (parts[0] !== "test" || !parts[1]) return { name: "home" };

  const file = decodeURIComponent(parts[1]);
  if (parts[2] === "results") return { name: "results", file };
  if (parts[2] === "section" && parts[3]) {
    return { name: "section", file, sectionId: decodeURIComponent(parts[3]) };
  }
  return { name: "test", file };
}

async function handleRoute(push = false) {
  const route = parseRoute();
  if (route.name === "home") {
    showStartScreen(push);
    return;
  }

  if (route.name === "results") {
    await enterExam(route.file, null, false);
    showResults(false, false);
    return;
  }

  await enterExam(route.file, route.sectionId, false);
}

async function loadTests() {
  dom.testsList.innerHTML = "<p class='muted'>Loading test variants...</p>";
  dom.startBtn.disabled = true;

  try {
    const data = await fetchTestsIndex();
    appState.tests = data.tests || [];
    dom.startBtn.disabled = !appState.selectedFile;
    renderTestsList();
    renderResultHistory();
  } catch (error) {
    dom.testsList.innerHTML = `<p class="feedback bad">Could not load test list. Try running a local static server or rebuild the static export.</p>`;
    console.error(error);
  }
}

async function fetchTestsIndex() {
  if (window.EXAMFORGE_STATIC_DATA?.manifest) {
    appState.staticMode = true;
    return window.EXAMFORGE_STATIC_DATA.manifest;
  }

  try {
    const response = await fetch("/api/tests");
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    appState.staticMode = false;
    return await response.json();
  } catch {
    const response = await fetch("tests/manifest.json");
    if (!response.ok) throw new Error(`Static manifest returned ${response.status}`);
    appState.staticMode = true;
    return response.json();
  }
}

async function fetchTestFile(file) {
  const embeddedTest = window.EXAMFORGE_STATIC_DATA?.tests?.[file];
  if (embeddedTest) {
    appState.staticMode = true;
    return embeddedTest;
  }

  const url = appState.staticMode
    ? `tests/${encodeURIComponent(file)}`
    : `/api/tests/${encodeURIComponent(file)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load ${file}: ${response.status}`);
  return response.json();
}

function renderTestsList() {
  if (!appState.tests.length) {
    dom.testsList.innerHTML = "<p class='muted'>No JSON test files found in tests/ yet.</p>";
    return;
  }

  dom.testsList.innerHTML = appState.tests
    .map((test) => {
      const sections = test.sections.map((section) => section.title).join(", ") || "No sections";
      return `
        <button class="test-card ${test.file === appState.selectedFile ? "is-selected" : ""}" type="button" data-file="${escapeHtml(test.file)}" ${test.invalid ? "disabled" : ""}>
          <strong>${escapeHtml(test.title)}</strong>
          <span><!--  ${escapeHtml(test.file)} · -->${escapeHtml(sections)}</span>
          ${test.invalid ? `<p class="feedback bad">${escapeHtml(test.error)}</p>` : ""}
        </button>
      `;
    })
    .join("");

  dom.testsList.querySelectorAll(".test-card").forEach((button) => {
    button.addEventListener("click", () => {
      appState.selectedFile = button.dataset.file;
      dom.startBtn.disabled = false;
      renderTestsList();
    });
  });
}

async function startExam() {
  if (!appState.selectedFile) return;
  const mode = getTimerMode();
  const existingProgress = loadActiveProgressKey(appState.selectedFile, mode) || defaultProgressKey(appState.selectedFile, mode);
  await enterExam(appState.selectedFile, null, true, {
    progressKey: existingProgress || undefined,
    reset: false,
    newAttempt: false
  });
}

async function enterExam(file, sectionId = null, push = true, options = {}) {
  const enterOptions = typeof options === "boolean" ? { reset: options } : options;
  const mode = getTimerMode();
  const needsLoad = !appState.test || appState.loadedFile !== file;
  const progressKey = enterOptions.progressKey || loadActiveProgressKey(file, mode) || defaultProgressKey(file, mode);

  if (needsLoad) {
    appState.test = await fetchTestFile(file);
    appState.selectedFile = file;
    appState.loadedFile = file;
    resetRuntimeState();
  }

  if (enterOptions.reset) {
    appState.progressKey = enterOptions.newAttempt ? newProgressKey(appState.test.id, mode) : defaultProgressKey(appState.test.id, mode);
    resetRuntimeState();
    appState.progressKey = enterOptions.newAttempt ? newProgressKey(appState.test.id, mode) : defaultProgressKey(appState.test.id, mode);
  } else {
    resetRuntimeState();
    const beforeLoadKey = progressKey;
    loadProgress(beforeLoadKey);
    if (!appState.progressKey) {
      appState.progressKey = beforeLoadKey;
    }
  }

  const firstSectionId = appState.test.sections[0]?.id || null;
  const validSection = appState.test.sections.find((section) => section.id === sectionId);
  appState.activeSectionId = validSection?.id || appState.activeSectionId || firstSectionId;
  appState.timer.locked = false;
  const timerSnapshot = loadTimerSnapshot(appState.activeSectionId);
  if (timerSnapshot) {
    appState.timer.savedState = timerSnapshot;
  }

  showExamScreen();
  renderExam();
  if (isCurrentTestCompleted()) {
    window.clearInterval(appState.timer.intervalId);
    dom.timerPanel.classList.add("is-hidden");
    appState.timer.locked = true;
  } else {
    syncTimerForActiveSection();
    saveProgress();
  }
  if (push) updateRoute(buildExamPath(file, appState.activeSectionId));
}

function renderExam() {
  renderTabs();
  renderActiveSection();
}

function renderTabs() {
  dom.sectionTabs.innerHTML = appState.test.sections
    .map((section) => {
      const checked = appState.checked[section.id] ? " ✓" : "";
      return `<button class="tab-button ${section.id === appState.activeSectionId ? "is-active" : ""}" type="button" data-section="${section.id}">${escapeHtml(section.title || section.id)}${checked}</button>`;
    })
    .join("");

  dom.sectionTabs.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      if (!isCurrentTestCompleted()) saveProgress();
      appState.activeSectionId = button.dataset.section;
      appState.timer.locked = false;
      renderExam();
      if (!isCurrentTestCompleted()) {
        syncTimerForActiveSection();
        saveProgress();
      }
      updateRoute(buildExamPath(appState.selectedFile, appState.activeSectionId), { save: false });
    });
  });
}

function renderActiveSection() {
  const section = appState.test.sections.find((item) => item.id === appState.activeSectionId);
  if (!section) return;

  const locked = Boolean(appState.checked[section.id] || appState.timer.locked);
  dom.examScreen.classList.toggle("is-wide", section.id === "reading");
  dom.examScreen.classList.toggle("is-listening", section.id === "listening");
  document.querySelector("main").classList.toggle("is-wide", section.id === "reading");
  const audio = section.audio
    ? `<div class="audio-box"><strong>Section audio</strong><audio controls src="${escapeHtml(resolveMediaPath(section.audio))}"></audio><p class="muted">${escapeHtml(section.audio)}</p></div>`
    : "";

  dom.examContent.innerHTML = `
    <article class="section-card">
      <div class="section-head">
        <div>
          <h2>${escapeHtml(section.title || section.id)}</h2>
          <p>${section.id === "writing" ? "Answers are saved locally. Writing is not auto-checked." : "Answer the questions and check the section when you are ready."}</p>
        </div>
        <div class="section-head-actions">
          ${appState.checked[section.id] ? `<span class="score-pill">${scoreLabel(section.id)}</span>` : ""}
        </div>
      </div>
      ${audio}
      ${renderParts(section, locked)}
      ${renderSectionActions(section, locked)}
    </article>
  `;

  bindSectionEvents(section, locked);
}

function renderParts(section, locked) {
  if (!Array.isArray(section.parts) || !section.parts.length) {
    return "<p class='muted'>This section has no tasks yet.</p>";
  }

  return section.parts.map((part) => renderPart(section, part, locked)).join("");
}

function renderPart(section, part, locked) {
  if (part.type === "long_text") return renderWritingPart(section, part, locked);
  if (usesDragDrop(section, part)) return renderDragPart(section, part, locked);
  if (usesCompactChoice(section, part)) return renderCompactChoicePart(section, part, locked);
  if (usesSplitReading(section, part)) return renderSplitReadingPart(section, part, locked);

  const questions = Array.isArray(part.questions) ? part.questions : [];
  return `
    <section class="part">
      <h3>${escapeHtml(part.title || part.id)}</h3>
      ${part.instructions ? `<p class="muted">${escapeHtml(part.instructions)}</p>` : ""}
      ${part.passage ? `<div class="passage">${escapeHtml(part.passage).replaceAll("\n", "<br />")}</div>` : ""}
      ${questions.map((question) => renderQuestion(section, part, question, locked)).join("")}
    </section>
  `;
}

function renderCompactChoicePart(section, part, locked) {
  const questions = Array.isArray(part.questions) ? part.questions : [];

  return `
    <section class="part compact-choice-part">
      <h3>${escapeHtml(part.title || part.id)}</h3>
      ${part.instructions ? `<p class="muted">${escapeHtml(part.instructions)}</p>` : ""}
      <div class="compact-choice-layout">
        <article class="compact-choice-text">
          ${part.passage ? `<div class="passage compact-choice-passage">${escapeHtml(part.passage).replaceAll("\n", "<br />")}</div>` : ""}
        </article>
        <aside class="compact-choice-panel" aria-label="Answer options">
          <h4>Answers</h4>
          <div class="compact-choice-grid">
            ${questions.map((question) => renderQuestion(section, part, question, locked)).join("")}
          </div>
        </aside>
      </div>
    </section>
  `;
}

function usesSplitReading(section, part) {
  return section.id === "reading" && part.type === "multiple_choice" && Boolean(part.passage) && !usesCompactChoice(section, part);
}

function usesCompactChoice(section, part) {
  return section.id === "reading" && part.type === "multiple_choice" && Boolean(part.passage) && part.questions?.every((question) => Array.isArray(question.options) && question.options.length <= 3);
}

function renderSplitReadingPart(section, part, locked) {
  const questions = Array.isArray(part.questions) ? part.questions : [];

  return `
    <section class="part split-reading-part">
      <h3>${escapeHtml(part.title || part.id)}</h3>
      ${part.instructions ? `<p class="muted">${escapeHtml(part.instructions)}</p>` : ""}
      <div class="split-reading-layout">
        <article class="split-reading-text">
          <div class="passage">${escapeHtml(part.passage).replaceAll("\n", "<br />")}</div>
        </article>
        <aside class="split-reading-questions" aria-label="Questions for the text">
          <h4>Questions</h4>
          ${questions.map((question) => renderQuestion(section, part, question, locked)).join("")}
        </aside>
      </div>
    </section>
  `;
}

function usesDragDrop(section, part) {
  if (section.id !== "reading") return false;
  if (part.type === "matching" || part.type === "sentence_insert") return true;
  return part.type === "gap_fill" && Array.isArray(part.options) && part.options.length > 0;
}

function renderDragPart(section, part, locked) {
  const questions = Array.isArray(part.questions) ? part.questions : [];
  const options = collectDragOptions(part, questions);
  const textCards = part.type === "matching" ? parseMatchingPassageCards(part.passage, options) : [];
  const passage = part.passage && part.type !== "matching" ? renderPassageWithDropzones(section, part, questions, locked) : "";
  const taskBoard = part.type === "sentence_insert" || part.type === "gap_fill"
    ? renderInlineDropQuestions(section, part, questions, locked)
    : renderMatchingBoard(section, part, questions, locked);
  const bank = part.type === "matching" && textCards.length
    ? renderMatchingTextBank(textCards, locked)
    : renderGapFillBank(part, questions, locked) || renderDragBank("Options", options, locked, part.type === "gap_fill" ? "is-compact" : "");

  return `
    <section class="part drag-part" data-drag-part="${escapeHtml(part.id)}">
      <h3>${escapeHtml(part.title || part.id)}</h3>
      ${part.instructions ? `<p class="muted">${escapeHtml(part.instructions)}</p>` : ""}
      <div class="drag-layout ${part.type === "matching" ? "matching-layout" : ""}">
        <div class="drag-main">
          ${passage}
          ${taskBoard}
        </div>
        ${bank}
      </div>
    </section>
  `;
}

function renderDragBank(title, options, locked, className = "") {
  return `
    <aside class="drag-bank ${escapeHtml(className)}" aria-label="${escapeHtml(title)}">
      <h4>${escapeHtml(title)}</h4>
      ${options.map((option) => renderDragChip(option, locked)).join("")}
    </aside>
  `;
}

function renderGapFillBank(part, questions, locked) {
  if (part.type !== "gap_fill") return "";
  const groupedQuestions = questions.filter((question) => Array.isArray(question.options) && question.options.length);
  if (!groupedQuestions.length) return "";

  return `
    <aside class="drag-bank gap-bank" aria-label="Answer options">
      <h4>Options</h4>
      ${groupedQuestions.map((question) => `
        <div class="gap-option-group">
          <h5>${escapeHtml(question.prompt || `Gap ${question.number}`)}</h5>
          <div class="gap-option-grid">
            ${question.options.map((option) => renderDragChip(option, locked)).join("")}
          </div>
        </div>
      `).join("")}
    </aside>
  `;
}

function collectDragOptions(part, questions) {
  const source = Array.isArray(part.options) && part.options.length
    ? part.options
    : questions.flatMap((question) => question.options || []);
  return [...new Set(source.map((option) => String(option)))];
}

function renderDragChip(option, locked, label = option) {
  const usedClass = isDragValueUsed(option) ? "is-used" : "";

  return `
    <button class="drag-chip ${usedClass}" type="button" draggable="${locked ? "false" : "true"}" data-drag-value="${escapeAttr(option)}" ${locked ? "disabled" : ""}>
      ${renderOptionLabel(label)}
      ${usedClass ? `<span class="option-used-label">Used</span>` : ""}
    </button>
  `;
}

function isDragValueUsed(option) {
  const sectionPrefix = `${appState.activeSectionId}:`;
  return Object.entries(appState.answers).some(([key, value]) => (
    key.startsWith(sectionPrefix) && String(value) === String(option)
  ));
}

function optionLabelParts(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^([A-Z])\)\s+(.+)$/);
  if (!match) return null;
  return { marker: match[1], text: match[2] };
}

function renderOptionLabel(value) {
  const parts = optionLabelParts(value);
  if (!parts) return escapeHtml(value);

  return `
    <span class="option-marker" aria-hidden="true">${escapeHtml(parts.marker)}</span>
    <span class="option-text">${escapeHtml(parts.text)}</span>
  `;
}

function parseMatchingPassageCards(passage, options) {
  if (!passage) return [];
  const labels = options.map((option) => String(option).trim()).filter(Boolean);
  if (!labels.length) return [];

  const pattern = new RegExp(`(?:^|\\n\\n)(${labels.map(escapeRegExp).join("|")})\\n`, "g");
  const matches = [...passage.matchAll(pattern)];
  if (!matches.length) return [];

  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : passage.length;
    return {
      label: match[1],
      text: passage.slice(start, end).trim()
    };
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderPrompt(question) {
  const prompt = String(question.prompt ?? "");
  const highlight = String(question.highlight ?? "").trim();
  if (!highlight || !prompt.includes(highlight)) return escapeHtml(prompt);

  const [before, ...rest] = prompt.split(highlight);
  return `${escapeHtml(before)}<strong>${escapeHtml(highlight)}</strong>${escapeHtml(rest.join(highlight))}`;
}

function renderMatchingTextBank(cards, locked) {
  return `
    <aside class="text-card-bank" aria-label="Matching texts">
      <h4>Texts</h4>
      ${cards.map((card) => `
        <article class="matching-text-card">
          <div class="matching-text-card-head">
            ${renderDragChip(card.label, locked, `Text ${card.label}`)}
          </div>
          <p>${escapeHtml(card.text)}</p>
        </article>
      `).join("")}
    </aside>
  `;
}

function renderPassageWithDropzones(section, part, questions, locked) {
  const questionNumbers = new Set(questions.map((question) => String(question.number)));
  const html = escapeHtml(part.passage).replace(/\((\d+)\)/g, (match, number) => {
    if (!questionNumbers.has(number)) return match;
    const question = questions.find((item) => String(item.number) === number);
    return renderInlineDropzone(section, question, locked, `(${number})`, "is-inline");
  });

  return `<div class="passage passage-drop">${html.replaceAll("\n", "<br />")}</div>`;
}

function renderInlineDropQuestions(section, part, questions, locked) {
  if (part.passage) return questions.map((question) => renderHiddenFeedbackQuestion(section, question)).join("");
  return `
    <div class="drop-list">
      ${questions.map((question) => `
        <div class="drop-row ${resultClassFor(section, question)}">
          <div class="question-title">
            <span class="question-number">№${escapeHtml(question.number)}</span>
            <span>${escapeHtml(question.prompt)}</span>
          </div>
          ${renderInlineDropzone(section, question, locked)}
          ${feedbackFor(section, question)}
        </div>
      `).join("")}
    </div>
  `;
}

function renderHiddenFeedbackQuestion(section, question) {
  const feedback = feedbackFor(section, question);
  if (!feedback) return "";
  return `
    <div class="inline-feedback ${resultClassFor(section, question)}">
      <strong>№${escapeHtml(question.number)}</strong>
      ${feedback}
    </div>
  `;
}

function renderMatchingBoard(section, part, questions, locked) {
  return `
    <div class="matching-board">
      <h4>Questions</h4>
      ${questions.map((question) => `
        <div class="match-row ${resultClassFor(section, question)}">
          <div class="match-prompt">
            <span class="question-number">№${escapeHtml(question.number)}</span>
            <span>${escapeHtml(question.prompt)}</span>
          </div>
          ${renderInlineDropzone(section, question, locked)}
          ${feedbackFor(section, question)}
        </div>
      `).join("")}
    </div>
  `;
}

function renderInlineDropzone(section, question, locked, placeholder = "Drop answer", className = "") {
  const key = answerKey(section.id, question.number);
  const value = appState.answers[key] || "";
  const filledClass = value ? "is-filled" : "";

  return `
    <button class="drop-zone ${escapeHtml(className)} ${filledClass} ${resultClassFor(section, question)}" type="button" data-drop-key="${escapeHtml(key)}" ${locked ? "disabled" : ""}>
      <span>${value ? renderOptionLabel(value) : escapeHtml(placeholder)}</span>
      ${value && !locked ? `<small class="drop-clear" data-clear-drop="${escapeHtml(key)}" aria-label="Remove answer" title="Remove answer">&times;</small>` : ""}
    </button>
  `;
}

function renderQuestion(section, part, question, locked) {
  const key = answerKey(section.id, question.number);
  const value = appState.answers[key] ?? "";
  const resultClass = resultClassFor(section, question);
  const feedback = feedbackFor(section, question);

  return `
    <div class="question ${resultClass}" data-question="${escapeHtml(question.number)}" data-type="${escapeHtml(part.type)}">
      <div class="question-title">
        <span class="question-number">№${escapeHtml(question.number)}</span>
        <span class="question-prompt">${renderPrompt(question)}</span>
      </div>
      ${renderQuestionInput(section, part, question, value, locked)}
      ${feedback}
    </div>
  `;
}

function renderQuestionInput(section, part, question, value, locked) {
  const disabled = locked ? "disabled" : "";

  if (part.type === "multiple_choice") {
    return `
      <div class="options-list">
        ${(question.options || [])
          .map((option) => {
            const checked = String(value) === String(option) ? "checked" : "";
            return `
              <label class="option-row">
                <input type="radio" name="${escapeHtml(answerKey(section.id, question.number))}" value="${escapeHtml(option)}" ${checked} ${disabled} />
                <span>${escapeHtml(option)}</span>
              </label>
            `;
          })
          .join("")}
      </div>
    `;
  }

  if (part.type === "matching" || part.type === "sentence_insert") {
    const options = question.options || part.options || [];
    return `
      <select class="select-line" data-answer="${escapeHtml(answerKey(section.id, question.number))}" ${disabled}>
        <option value="">Choose an answer</option>
        ${options.map((option) => `<option value="${escapeHtml(option)}" ${String(value) === String(option) ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    `;
  }

  return `<input class="input-line" data-answer="${escapeHtml(answerKey(section.id, question.number))}" value="${escapeHtml(value)}" placeholder="Your answer" ${disabled} />`;
}

function renderWritingPart(section, part, locked) {
  const key = answerKey(section.id, part.id);
  const text = appState.answers[key] || "";
  const count = wordCount(text);
  const status = wordStatus(count, part.min_words, part.max_words);

  return `
    <section class="part writing-part">
      <h3>${escapeHtml(part.title || part.id)}</h3>
      <div class="question writing-question">
        <div class="writing-task-head">
          <span class="question-number">${escapeHtml(part.id)}</span>
          <strong>${escapeHtml(part.title || part.id)}</strong>
        </div>
        <div class="writing-prompt">${escapeHtml(part.prompt).replaceAll("\n", "<br />")}</div>
        <textarea class="writing-box" data-writing="${escapeHtml(key)}" data-min="${escapeHtml(part.min_words)}" data-max="${escapeHtml(part.max_words)}" ${locked ? "disabled" : ""}>${escapeHtml(text)}</textarea>
        <div class="block-actions">
          <span class="word-pill ${status.kind}" data-word-count="${escapeHtml(key)}">Words: ${count}</span>
          <span class="status-pill ${status.kind}" data-word-status="${escapeHtml(key)}">${escapeHtml(status.label)}</span>
        </div>
      </div>
    </section>
  `;
}

function renderSectionActions(section, locked) {
  if (section.id === "writing") {
    return `
      <div class="block-actions">
        <button class="secondary-button" type="button" data-action="save-writing">Save Writing</button>
        <button class="primary-button" type="button" data-action="finish-test">Finish test</button>
      </div>
    `;
  }

  return `
    <div class="block-actions">
      <button class="primary-button" type="button" data-action="check-section" ${locked ? "disabled" : ""}>Check section</button>
      ${appState.checked[section.id] ? `<button class="secondary-button" type="button" data-action="undo-check-section">Undo check</button>` : ""}
      ${appState.checked[section.id] ? `<span class="score-pill">${scoreLabel(section.id)}</span>` : ""}
    </div>
  `;
}

function bindSectionEvents(section) {
  dom.examContent.querySelectorAll("input[type='radio']").forEach((input) => {
    input.addEventListener("change", () => {
      appState.answers[input.name] = input.value;
      saveProgress();
    });
  });

  dom.examContent.querySelectorAll("[data-answer]").forEach((input) => {
    input.addEventListener("input", () => {
      appState.answers[input.dataset.answer] = input.value;
      saveProgress();
    });
  });

  dom.examContent.querySelectorAll("[data-writing]").forEach((textarea) => {
    textarea.setAttribute("spellcheck", "false");
    textarea.setAttribute("autocapitalize", "off");
    textarea.setAttribute("autocomplete", "off");
    textarea.addEventListener("input", () => {
      appState.answers[textarea.dataset.writing] = textarea.value;
      updateWritingStatus(textarea);
      saveProgress();
    });
  });

  bindDragDropEvents();

  const checkButton = dom.examContent.querySelector("[data-action='check-section']");
  if (checkButton) {
    checkButton.addEventListener("click", () => checkSection(section));
  }

  const undoCheckButton = dom.examContent.querySelector("[data-action='undo-check-section']");
  if (undoCheckButton) {
    undoCheckButton.addEventListener("click", () => undoCheckSection(section));
  }

  const saveWritingButton = dom.examContent.querySelector("[data-action='save-writing']");
  if (saveWritingButton) {
    saveWritingButton.addEventListener("click", () => {
      appState.checked[section.id] = true;
      saveProgress();
      renderExam();
    });
  }

  const finishButton = dom.examContent.querySelector("[data-action='finish-test']");
  if (finishButton) finishButton.addEventListener("click", showResults);

  bindAudioEvents(section);
}

function exitTest() {
  pausePracticeTimer();
  saveProgress();
  window.clearInterval(appState.timer.intervalId);
  showStartScreen(true);
  loadTests();
}

function bindDragDropEvents() {
  dom.examContent.querySelectorAll("[data-drag-value]").forEach((chip) => {
    chip.addEventListener("dragstart", (event) => {
      appState.selectedDragValue = chip.dataset.dragValue;
      event.dataTransfer.setData("text/plain", chip.dataset.dragValue);
      event.dataTransfer.effectAllowed = "copy";
      chip.classList.add("is-dragging");
    });

    chip.addEventListener("dragend", () => {
      chip.classList.remove("is-dragging");
    });

    chip.addEventListener("click", () => {
      appState.selectedDragValue = chip.dataset.dragValue;
      dom.examContent.querySelectorAll("[data-drag-value]").forEach((node) => node.classList.remove("is-selected"));
      chip.classList.add("is-selected");
    });
  });

  dom.examContent.querySelectorAll("[data-drop-key]").forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("is-over");
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("is-over");
    });

    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("is-over");
      setDroppedAnswer(zone.dataset.dropKey, event.dataTransfer.getData("text/plain"));
    });

    zone.addEventListener("click", (event) => {
      const clearButton = event.target.closest("[data-clear-drop]");
      if (clearButton) {
        event.stopPropagation();
        setDroppedAnswer(clearButton.dataset.clearDrop, "");
        return;
      }

      if (appState.selectedDragValue) {
        setDroppedAnswer(zone.dataset.dropKey, appState.selectedDragValue);
      }
    });
  });
}

function setDroppedAnswer(key, value) {
  appState.answers[key] = value;
  saveProgress();
  renderActiveSection();
}

function audioStateKey(sectionId) {
  const file = appState.selectedFile || appState.test?.id || "test";
  return `${file}:${sectionId}`;
}

function bindAudioEvents(section) {
  const audio = dom.examContent.querySelector("audio");
  if (!audio) return;

  const key = audioStateKey(section.id);
  const saved = appState.timer.audioStates?.[key];
  const restoreTime = Number(saved?.currentTime);

  if (Number.isFinite(restoreTime) && restoreTime > 0) {
    audio.addEventListener("loadedmetadata", () => {
      try {
        audio.currentTime = Math.min(restoreTime, Math.max(0, audio.duration || restoreTime));
      } catch {
        // Ignore seek failures on browsers that restrict early seeking.
      }
    }, { once: true });
  }

  const persist = () => {
    appState.timer.audioStates[key] = {
      currentTime: Math.max(0, audio.currentTime || 0)
    };
    saveProgress();
  };

  audio.addEventListener("timeupdate", persist);
  audio.addEventListener("seeked", persist);
  audio.addEventListener("pause", persist);
  audio.addEventListener("ended", () => {
    appState.timer.audioStates[key] = { currentTime: 0 };
    saveProgress();
  });
}

function updateWritingStatus(textarea) {
  const key = textarea.dataset.writing;
  const count = wordCount(textarea.value);
  const status = wordStatus(count, Number(textarea.dataset.min), Number(textarea.dataset.max));
  const countNode = dom.examContent.querySelector(`[data-word-count="${CSS.escape(key)}"]`);
  const statusNode = dom.examContent.querySelector(`[data-word-status="${CSS.escape(key)}"]`);
  if (countNode) {
    countNode.textContent = `Words: ${count}`;
    countNode.className = `word-pill ${status.kind}`;
  }
  if (statusNode) {
    statusNode.textContent = status.label;
    statusNode.className = `status-pill ${status.kind}`;
  }
}

function wordStatus(count, min, max) {
  if (min && count < min) return { kind: "bad", label: `Below limit: ${min}-${max} words` };
  if (max && count > max) return { kind: "bad", label: `Above limit: ${min}-${max} words` };
  return { kind: "ok", label: `Within limit: ${min}-${max} words` };
}

function correctValues(question) {
  return Array.isArray(question.correct) ? question.correct : [question.correct];
}

function isAnswerCorrect(userAnswer, question) {
  const normalizedUser = normalizeAnswer(userAnswer);
  return correctValues(question).some((correct) => normalizeAnswer(correct) === normalizedUser);
}

function checkSection(section) {
  let total = 0;
  let correct = 0;

  section.parts.forEach((part) => {
    if (part.type === "long_text") return;
    (part.questions || []).forEach((question) => {
      total += 1;
      const userAnswer = appState.answers[answerKey(section.id, question.number)];
      if (isAnswerCorrect(userAnswer, question)) correct += 1;
    });
  });

  appState.checked[section.id] = true;
  appState.sectionScores[section.id] = { correct, total };
  saveProgress();
  renderExam();
}

function undoCheckSection(section) {
  delete appState.checked[section.id];
  delete appState.sectionScores[section.id];
  appState.timer.locked = false;
  saveProgress();
  renderExam();
}

function resultClassFor(section, question) {
  if (!appState.checked[section.id]) return "";
  const userAnswer = appState.answers[answerKey(section.id, question.number)];
  return isAnswerCorrect(userAnswer, question) ? "is-correct" : "is-wrong";
}

function feedbackFor(section, question) {
  if (!appState.checked[section.id]) return "";
  const userAnswer = appState.answers[answerKey(section.id, question.number)];
  const correct = correctValues(question).join(" / ");

  if (isAnswerCorrect(userAnswer, question)) {
    return `<div class="feedback ok">Correct</div>`;
  }

  return `<div class="feedback bad">Incorrect. Correct answer: ${escapeHtml(correct)}</div>`;
}

function scoreLabel(sectionId) {
  const score = appState.sectionScores[sectionId];
  if (!score) return "Not checked";
  return `${score.correct} of ${score.total}`;
}

function saveResultRecord(summary) {
  const raw = localStorage.getItem(resultsStorageKey());
  let records = [];
  try {
    records = raw ? JSON.parse(raw) : [];
  } catch {
    records = [];
  }

  records.unshift(summary);
  localStorage.setItem(resultsStorageKey(), JSON.stringify(records.slice(0, 50)));
  renderResultHistory();
}

function loadResultRecords() {
  try {
    return JSON.parse(localStorage.getItem(resultsStorageKey()) || "[]");
  } catch {
    return [];
  }
}

function renderResultHistory() {
  if (!dom.resultHistory) return;
  const progressRecords = loadProgressRecords().slice(0, 5);
  const resultRecords = loadResultRecords().slice(0, 5);

  if (!progressRecords.length && !resultRecords.length) {
    dom.resultHistory.innerHTML = "<p class='muted'>No local attempts yet.</p>";
    return;
  }

  const progressHtml = progressRecords.length
    ? `
      <h4>Saved tests</h4>
      ${progressRecords.map((record) => `
        <div class="history-row">
          <strong>${escapeHtml(record.testTitle)}</strong>
          <span>${escapeHtml(record.activeSectionId || "Not started")}</span>
          <small>${new Date(record.updatedAt).toLocaleString()}</small>
          <button class="secondary-button" type="button" data-continue-file="${escapeHtml(record.file)}" data-continue-section="${escapeHtml(record.activeSectionId || "")}" data-progress-key="${escapeHtml(record.key)}">Continue</button>
          <button class="danger-button" type="button" data-delete-progress="${escapeHtml(record.key)}">Delete</button>
        </div>
      `).join("")}
    `
    : "";

  const resultsHtml = resultRecords.length
    ? `
      <h4>Completed results</h4>
      ${resultRecords
    .map((record) => `
      <div class="history-row">
        <strong>${escapeHtml(record.testTitle)}</strong>
        <span>${record.totalCorrect} of ${record.totalQuestions}</span>
        <small>${new Date(record.completedAt).toLocaleString()}</small>
        <button class="secondary-button" type="button" data-open-result="${escapeHtml(record.id)}">View</button>
        <button class="danger-button" type="button" data-delete-result="${escapeHtml(record.id)}">Delete</button>
      </div>
    `)
    .join("")}
    `
    : "";

  dom.resultHistory.innerHTML = `${progressHtml}${resultsHtml}`;
  dom.resultHistory.querySelectorAll("[data-continue-file]").forEach((button) => {
    button.addEventListener("click", () => {
      enterExam(button.dataset.continueFile, button.dataset.continueSection || null, true, {
        progressKey: button.dataset.progressKey
      });
    });
  });

  dom.resultHistory.querySelectorAll("[data-delete-progress]").forEach((button) => {
    button.addEventListener("click", () => {
      localStorage.removeItem(button.dataset.deleteProgress);
      renderResultHistory();
    });
  });

  dom.resultHistory.querySelectorAll("[data-open-result]").forEach((button) => {
    button.addEventListener("click", () => openResultRecord(button.dataset.openResult));
  });

  dom.resultHistory.querySelectorAll("[data-delete-result]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteResultRecord(button.dataset.deleteResult);
      renderResultHistory();
    });
  });
}

function loadProgressRecords() {
  const records = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith("examforge:progress:")) continue;
    try {
      const progress = JSON.parse(localStorage.getItem(key));
      records.push({
        ...progress,
        key,
        updatedAt: progress.updatedAt || new Date(0).toISOString()
      });
    } catch {
      // Ignore malformed local progress.
    }
  }

  return records
    .filter((record) => record.file && record.testTitle)
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
}

function deleteResultRecord(recordId) {
  const raw = localStorage.getItem(resultsStorageKey());
  if (!raw) return;

  let records = [];
  try {
    records = JSON.parse(raw);
  } catch {
    records = [];
  }

  localStorage.setItem(resultsStorageKey(), JSON.stringify(records.filter((record) => record.id !== recordId)));
}

async function openResultRecord(recordId) {
  const record = loadResultRecords().find((item) => item.id === recordId);
  if (!record) return;

  const hasFullAttempt = Boolean(record.file && record.answers && record.checked);
  if (!hasFullAttempt) {
    openTeacherReportRecord(record);
    return;
  }

  await enterExam(record.file, record.activeSectionId || null, true, {
    progressKey: record.progressKey || defaultProgressKey(record.testId || record.file),
    reset: false
  });

  appState.answers = record.answers || {};
  appState.checked = record.checked || {};
  appState.sectionScores = record.sectionScores || {};
  appState.activeSectionId = record.activeSectionId || appState.activeSectionId;
  appState.timer.savedState = record.timer || null;
  appState.timer.audioStates = record.audioStates || {};
  appState.timer.locked = true;

  renderExam();
  showResults(false, false);
}

function buildTeacherReportFromRecord(record) {
  const generatedAt = new Date().toLocaleString();
  const title = `${record.testTitle || record.testId || "Test"} - Teacher report`;
  const sections = record.sectionScores || {};
  const sectionRows = Object.entries(sections).map(([sectionId, score]) => {
    const label = `${sectionId.charAt(0).toUpperCase()}${sectionId.slice(1)}`;
    return `
      <section class="report-part">
        <h3>${escapeHtml(label)}</h3>
        <p class="report-meta">Score: ${escapeHtml(score.correct)} / ${escapeHtml(score.total)}</p>
      </section>
    `;
  }).join("");
  const writing = record.writingWordCounts || {};
  const writingRows = Object.keys(writing).length
    ? `
      <section class="report-part">
        <h3>Writing</h3>
        ${Object.entries(writing).map(([partId, count]) => `<p class="report-meta">${escapeHtml(partId)}: ${escapeHtml(count)} words</p>`).join("")}
      </section>
    `
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; padding: 32px; font-family: Arial, sans-serif; color: #1d2430; line-height: 1.5; }
    h1, h2, h3 { margin: 0 0 12px; }
    h1 { font-size: 28px; }
    .report-meta { color: #667085; font-size: 14px; }
    .report-part { margin: 18px 0; padding: 16px; border: 1px solid #d0d5dd; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="report-meta">Generated: ${escapeHtml(generatedAt)}</p>
  <section class="report-part">
    <h3>Summary</h3>
    <p class="report-meta">Total score: ${escapeHtml(record.totalCorrect ?? 0)} / ${escapeHtml(record.totalQuestions ?? 0)}</p>
    <p class="report-meta">Completed: ${escapeHtml(record.completedAt || "")}</p>
  </section>
  ${sectionRows}
  ${writingRows}
</body>
</html>`;
}

function openTeacherReportRecord(record) {
  const html = buildTeacherReportFromRecord(record);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${String(record.testId || "test")}-teacher-report.html`;
    document.body.append(link);
    link.click();
    link.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function syncTimerForActiveSection() {
  window.clearInterval(appState.timer.intervalId);
  appState.timer.locked = false;
  appState.timer.isPaused = false;

  const activeSection = appState.test.sections.find((section) => section.id === appState.activeSectionId);
  appState.timer.limitSeconds = getTimerScope() === "test" ? getTotalLimitSeconds() : getSectionLimitMinutes(activeSection) * 60;
  const saved = loadTimerSnapshot(activeSection?.id);
  const remainingSeconds = saved?.remainingSeconds;
  appState.timer.remainingSeconds = Number.isFinite(Number(remainingSeconds))
    ? Math.max(0, Number(remainingSeconds))
    : appState.timer.limitSeconds;
  appState.timer.elapsedSeconds = Number.isFinite(Number(saved?.elapsedSeconds))
    ? Math.max(0, Number(saved.elapsedSeconds))
    : Math.max(0, appState.timer.limitSeconds - appState.timer.remainingSeconds);
  dom.timerPanel.classList.remove("is-hidden");
  renderTimer();
  scheduleTimerInterval();
}

function scheduleTimerInterval() {
  window.clearInterval(appState.timer.intervalId);
  appState.timer.intervalId = window.setInterval(() => {
    tickTimer();
  }, 1000);
}

function tickTimer() {
  if (appState.timer.isPaused) return;
  const mode = getTimerMode();
  if (mode === "exam") {
    appState.timer.remainingSeconds = Math.max(0, appState.timer.remainingSeconds - 1);
    appState.timer.elapsedSeconds = Math.min(appState.timer.limitSeconds, appState.timer.elapsedSeconds + 1);
    if (appState.timer.remainingSeconds <= 0) {
      saveProgress();
      window.clearInterval(appState.timer.intervalId);
      handleTimeExpired();
      return;
    }
  } else {
    appState.timer.elapsedSeconds = appState.timer.elapsedSeconds + 1;
    appState.timer.remainingSeconds = appState.timer.remainingSeconds;
  }

  renderTimer();
  saveProgress();
}

function pausePracticeTimer() {
  if (getTimerMode() !== "practice" || appState.timer.isPaused || dom.timerPanel.classList.contains("is-hidden")) return;
  appState.timer.isPaused = true;
  window.clearInterval(appState.timer.intervalId);
  saveProgress();
  renderTimer();
}

function resumePracticeTimer() {
  if (getTimerMode() !== "practice" || !appState.timer.isPaused || dom.timerPanel.classList.contains("is-hidden")) return;
  appState.timer.isPaused = false;
  scheduleTimerInterval();
  renderTimer();
}

function renderTimer() {
  const mode = getTimerMode();
  const scope = getTimerScope() === "test" ? "whole test" : "current section";
  const seconds = mode === "exam" ? appState.timer.remainingSeconds : appState.timer.elapsedSeconds;
  dom.timerPanel.classList.toggle("is-danger", mode === "exam" && seconds <= 60);
  const paused = appState.timer.isPaused ? " · paused" : "";
  dom.timerPanel.innerHTML = `
    <span class="timer-label">${mode === "exam" ? "Exam mode" : "Practice mode"} · ${scope}${paused}</span>
    <strong class="timer-value">${formatTime(seconds)}</strong>
  `;
}

function handleTimeExpired() {
  appState.timer.locked = true;
  const section = appState.test.sections.find((item) => item.id === appState.activeSectionId);
  if (section && section.id !== "writing" && !appState.checked[section.id]) {
    checkSection(section);
    return;
  }
  renderExam();
}

function showResults(push = true, persist = true) {
  window.clearInterval(appState.timer.intervalId);
  dom.timerPanel.classList.add("is-hidden");
  dom.topbarExitBtn.classList.add("is-hidden");
  dom.examScreen.classList.add("is-hidden");
  dom.resultsScreen.classList.remove("is-hidden");
  dom.startScreen.classList.add("is-hidden");
  document.querySelector("main").classList.remove("is-wide");
  dom.resultSubtitle.textContent = appState.test.title;

  const checkedScores = Object.values(appState.sectionScores);
  const totalCorrect = checkedScores.reduce((sum, score) => sum + score.correct, 0);
  const totalQuestions = checkedScores.reduce((sum, score) => sum + score.total, 0);
  const completedAt = new Date().toISOString();

  if (persist) {
    saveResultRecord({
      id: `${appState.test.id}:${completedAt}`,
      testId: appState.test.id,
      testTitle: appState.test.title,
      file: appState.selectedFile,
      progressKey: storageKey(),
      completedAt,
      totalCorrect,
      totalQuestions,
      answers: appState.answers,
      checked: appState.checked,
      sectionScores: appState.sectionScores,
      audioStates: appState.timer.audioStates,
      activeSectionId: appState.activeSectionId,
      timer: getTimerSnapshot(),
      writingWordCounts: writingWordCounts()
    });
  }

  dom.resultsContent.innerHTML = `
    <div class="result-card">
      <strong>Overall score</strong>
      <p>${totalCorrect} of ${totalQuestions} auto-checked questions</p>
      <p class="muted">Writing is saved without automatic scoring.</p>
    </div>
    ${appState.test.sections.map(renderResultCard).join("")}
    <div class="result-card result-actions-card">
      <strong>Teacher export</strong>
      <p class="muted">Download an HTML report with tasks, answers and writing texts.</p>
      <button class="secondary-button" type="button" data-action="export-teacher-report">Download HTML</button>
    </div>
  `;

  const exportButton = dom.resultsContent.querySelector("[data-action='export-teacher-report']");
  if (exportButton) exportButton.addEventListener("click", downloadTeacherReport);

  if (push) updateRoute(buildResultsPath(appState.selectedFile));
}

function reportAnswerClass(userAnswer, question) {
  if (!userAnswer) return "missing";
  return isAnswerCorrect(userAnswer, question) ? "correct" : "wrong";
}

function renderReportQuestion(section, question) {
  const userAnswer = appState.answers[answerKey(section.id, question.number)] || "";
  const answerClass = reportAnswerClass(userAnswer, question);
  const correct = correctValues(question).filter(Boolean).join(" / ");
  const needsCorrectAnswer = answerClass !== "correct" && correct;

  return `
    <div class="report-question">
      <div class="report-prompt"><strong>${escapeHtml(question.number)}.</strong> ${escapeHtml(question.prompt || "Question")}</div>
      <div class="report-answer ${answerClass}">My answer: ${userAnswer ? escapeHtml(userAnswer) : "No answer"}</div>
      ${needsCorrectAnswer ? `<div class="report-correct">Correct answer: ${escapeHtml(correct)}</div>` : ""}
    </div>
  `;
}

function renderReportWritingPart(section, part) {
  const text = appState.answers[answerKey(section.id, part.id)] || "";
  const count = wordCount(text);

  return `
    <article class="report-part">
      <h3>${escapeHtml(part.title || part.id)}</h3>
      <div class="report-task">${escapeHtml(part.prompt || "").replaceAll("\n", "<br />")}</div>
      <p class="report-meta">Words: ${count}</p>
      <div class="report-writing">${escapeHtml(text || "No text submitted")}</div>
    </article>
  `;
}

function renderReportPart(section, part) {
  if (part.type === "long_text") return renderReportWritingPart(section, part);
  const questions = Array.isArray(part.questions) ? part.questions : [];

  return `
    <article class="report-part">
      <h3>${escapeHtml(part.title || part.id)}</h3>
      ${part.instructions ? `<p class="report-meta">${escapeHtml(part.instructions)}</p>` : ""}
      ${part.passage ? `<div class="report-task">${escapeHtml(part.passage).replaceAll("\n", "<br />")}</div>` : ""}
      ${questions.map((question) => renderReportQuestion(section, question)).join("")}
    </article>
  `;
}

function buildTeacherReportHtml() {
  const generatedAt = new Date().toLocaleString();
  const title = `${appState.test.title} - Teacher report`;
  const body = appState.test.sections.map((section) => `
    <section class="report-section">
      <h2>${escapeHtml(section.title || section.id)}</h2>
      ${(section.parts || []).map((part) => renderReportPart(section, part)).join("")}
    </section>
  `).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; padding: 32px; font-family: Arial, sans-serif; color: #1d2430; line-height: 1.5; }
    h1, h2, h3 { margin: 0 0 12px; }
    h1 { font-size: 28px; }
    h2 { margin-top: 28px; padding-bottom: 8px; border-bottom: 2px solid #d0d5dd; }
    h3 { margin-top: 18px; font-size: 18px; }
    .report-meta { color: #667085; font-size: 14px; }
    .report-part { margin: 18px 0; padding: 16px; border: 1px solid #d0d5dd; border-radius: 8px; }
    .report-task { margin: 12px 0; padding: 12px; background: #f8fafc; border: 1px solid #eaecf0; border-radius: 6px; }
    .report-question { margin: 12px 0; padding-top: 12px; border-top: 1px solid #eaecf0; }
    .report-answer { margin-top: 6px; font-weight: 700; }
    .report-answer.correct { color: #027a48; }
    .report-answer.wrong, .report-answer.missing { color: #b42318; }
    .report-correct { margin-top: 4px; color: #175cd3; font-weight: 700; }
    .report-writing { white-space: pre-wrap; padding: 14px; border: 1px solid #d0d5dd; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="report-meta">Generated: ${escapeHtml(generatedAt)}</p>
  ${body}
</body>
</html>`;
}

function reportFileName() {
  const base = `${appState.test.id || "test"}-teacher-report`;
  return `${base.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}.html`;
}

function downloadTeacherReport() {
  const blob = new Blob([buildTeacherReportHtml()], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFileName();
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function writingWordCounts() {
  const writing = appState.test.sections.find((section) => section.id === "writing");
  if (!writing) return {};
  return Object.fromEntries(
    writing.parts
      .filter((part) => part.type === "long_text")
      .map((part) => [part.id, wordCount(appState.answers[answerKey("writing", part.id)] || "")])
  );
}

function renderResultCard(section) {
  if (section.id === "writing") {
    const writingParts = section.parts.filter((part) => part.type === "long_text");
    const lines = writingParts
      .map((part) => {
        const count = wordCount(appState.answers[answerKey(section.id, part.id)] || "");
        return `${escapeHtml(part.title || part.id)}: ${count} words`;
      })
      .join("<br />");
    return `<div class="result-card"><strong>${escapeHtml(section.title)}</strong><p>${lines || "No answers"}</p></div>`;
  }

  return `<div class="result-card"><strong>${escapeHtml(section.title)}</strong><p>${scoreLabel(section.id)}</p></div>`;
}

dom.refreshTests.addEventListener("click", loadTests);
dom.startBtn.addEventListener("click", startExam);
dom.topbarExitBtn.addEventListener("click", exitTest);
dom.restartBtn.addEventListener("click", () => {
  showStartScreen(true);
  loadTests();
});

window.addEventListener("popstate", () => {
  handleRoute(false);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pausePracticeTimer();
    saveProgress();
  } else {
    resumePracticeTimer();
  }
});

window.addEventListener("beforeunload", () => {
  pausePracticeTimer();
  saveProgress();
});

loadTests().then(() => handleRoute(false));
