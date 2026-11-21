// ============================================================
// BEÁLLÍTÁSOK – a vizsga paramétereit itt módosíthatod
// ============================================================
const CONFIG = {
  EXAM_QUESTION_COUNT: 25,
  EXAM_DURATION_MINUTES: 15,

  // Ponthatárok százalékban, csökkenő sorrendben.
  GRADE_THRESHOLDS: [
    { minPercent: 90, label: "Jeles" },
    { minPercent: 75, label: "Jó" },
    { minPercent: 60, label: "Közepes" },
    { minPercent: 40, label: "Elégséges" },
    { minPercent: 0, label: "Elégtelen" }
  ],

  PRACTICE_INSTANT_FEEDBACK: true,
  MODULES_FOLDER: "modulok",
  MODULE_FILE_COUNT: 25
};

// ============================================================
// MŰKÖDÉS
// ============================================================
const state = {
  questions: [], sessionQuestions: [], answers: [], currentIndex: 0,
  mode: "exam", selectedTopic: "", secondsLeft: 0, timerId: null, finished: false
};
const $ = selector => document.querySelector(selector);
const homeScreen = $("#home-screen");
const quizScreen = $("#quiz-screen");
const resultScreen = $("#result-screen");

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function showScreen(screen) {
  [homeScreen, quizScreen, resultScreen].forEach(s => s.classList.add("hidden"));
  screen.classList.remove("hidden");
  window.scrollTo(0, 0);
}
function topics() {
  return [...new Set(state.questions.map(q => q.fejezet))].sort((a, b) => a.localeCompare(b, "hu"));
}
function validateQuestions(data) {
  if (!Array.isArray(data) || !data.length) throw new Error("A kérdéslista üres vagy hibás.");
  return data.map(q => {
    const answer = String(q.valasz ?? "").trim().toLowerCase();
    if (!q.fejezet || !q.kerdes || !["igaz", "hamis"].includes(answer)) {
      throw new Error("Hibás kérdésadat. Ellenőrizd a fejezet, kerdes és valasz mezőket.");
    }
    return { ...q, valasz: answer };
  });
}
async function loadQuestions() {
  const status = $("#load-status");
  const loaded = [];
  const missing = [];
  const invalid = [];

  // A 01.json–25.json fájlokat külön-külön töltjük be.
  // A hiányzó vagy hibás fájl nem akadályozza a többi modul betöltését.
  const requests = Array.from({ length: CONFIG.MODULE_FILE_COUNT }, (_, index) => {
    const fileName = `${String(index + 1).padStart(2, "0")}.json`;
    return { fileName, url: `${CONFIG.MODULES_FOLDER}/${fileName}` };
  });

  const results = await Promise.all(requests.map(async ({ fileName, url }) => {
    try {
      const response = await fetch(url);
      if (response.status === 404) {
        missing.push(fileName);
        return [];
      }
      if (!response.ok) {
        invalid.push(`${fileName} (HTTP ${response.status})`);
        return [];
      }
      const data = await response.json();
      const validated = validateQuestions(data);
      loaded.push(fileName);
      return validated;
    } catch (error) {
      // A nem létező fájl fetch hibája, illetve a hibás JSON is csak ezt a modult érinti.
      if (error instanceof SyntaxError) invalid.push(`${fileName} (hibás JSON)`);
      else if (!missing.includes(fileName)) invalid.push(`${fileName} (nem olvasható vagy hibás adatok)`);
      return [];
    }
  }));

  state.questions = results.flat();

  const select = $("#topic-select");
  select.innerHTML = '<option value="">Válassz témakört…</option>';
  topics().forEach(topic => {
    const count = state.questions.filter(q => q.fejezet === topic).length;
    const option = document.createElement("option");
    option.value = topic;
    option.textContent = `${topic.replace(/^\d+_/, "").replaceAll("_", " ")} (${count})`;
    select.append(option);
  });

  $("#exam-count").textContent = CONFIG.EXAM_QUESTION_COUNT;
  $("#exam-time").textContent = CONFIG.EXAM_DURATION_MINUTES;

  if (state.questions.length) {
    status.textContent = `${state.questions.length} kérdés betöltve ${loaded.length} modulból.`;
    if (missing.length) status.textContent += ` Hiányzó modulok kihagyva: ${missing.join(", ")}.`;
    if (invalid.length) status.textContent += ` Nem sikerült betölteni: ${invalid.join(", ")}.`;
    $("#start-exam").disabled = false;
  } else {
    status.textContent = "Nem található betölthető kérdés. Ellenőrizd a modulok mappában lévő 01.json–25.json fájlokat és azok tartalmát.";
    status.classList.add("error");
    $("#start-exam").disabled = true;
  }
}
function createExamQuestions() {
  const total = Math.min(CONFIG.EXAM_QUESTION_COUNT, state.questions.length);
  const topicList = shuffle(topics());
  const base = Math.floor(total / topicList.length);
  let remainder = total % topicList.length;
  const chosen = [];
  topicList.forEach(topic => {
    const wanted = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    chosen.push(...shuffle(state.questions.filter(q => q.fejezet === topic)).slice(0, wanted));
  });
  if (chosen.length < total) {
    const ids = new Set(chosen.map(q => q.id));
    chosen.push(...shuffle(state.questions.filter(q => !ids.has(q.id))).slice(0, total - chosen.length));
  }
  return shuffle(chosen.slice(0, total));
}
function startSession(mode, questions, topic = "") {
  stopTimer();
  state.mode = mode;
  state.sessionQuestions = questions;
  state.answers = Array(questions.length).fill(null);
  state.currentIndex = 0;
  state.selectedTopic = topic;
  state.finished = false;
  $("#mode-label").textContent = mode === "exam" ? "VIZSGA" : "GYAKORLÁS";
  $("#timer").classList.toggle("hidden", mode !== "exam");
  $("#finish-quiz").textContent = mode === "exam" ? "Vizsga befejezése" : "Gyakorlás befejezése";
  showScreen(quizScreen);
  renderQuestion();
  if (mode === "exam") {
    state.secondsLeft = CONFIG.EXAM_DURATION_MINUTES * 60;
    updateTimer();
    state.timerId = setInterval(() => {
      state.secondsLeft--;
      updateTimer();
      if (state.secondsLeft <= 0) finishSession(true);
    }, 1000);
  }
}
function stopTimer() {
  if (state.timerId !== null) clearInterval(state.timerId);
  state.timerId = null;
}
function updateTimer() {
  $("#timer").textContent = `${String(Math.floor(state.secondsLeft / 60)).padStart(2, "0")}:${String(state.secondsLeft % 60).padStart(2, "0")}`;
  $("#timer").classList.toggle("warning", state.secondsLeft <= 60);
}
function renderQuestion() {
  const q = state.sessionQuestions[state.currentIndex];
  const answer = state.answers[state.currentIndex];
  const total = state.sessionQuestions.length;
  $("#question-counter").textContent = `${state.currentIndex + 1} / ${total}`;
  $("#answered-counter").textContent = `Megválaszolva: ${state.answers.filter(a => a !== null).length}`;
  $("#progress-fill").style.width = `${(state.currentIndex + 1) / total * 100}%`;
  $("#question-topic").textContent = q.fejezet.replace(/^\d+_/, "").replaceAll("_", " ");
  $("#question-text").textContent = q.kerdes;

  document.querySelectorAll(".answer").forEach(button => {
    button.classList.toggle("selected", button.dataset.answer === answer);
    button.disabled = state.mode === "practice" && CONFIG.PRACTICE_INSTANT_FEEDBACK && answer !== null;
  });
  const feedback = $("#feedback");
  feedback.className = "feedback hidden";
  if (answer !== null) {
    const correct = answer === q.valasz;
    feedback.className = `feedback ${correct ? "correct" : "incorrect"}`;
    const explanation = q.magyarazat ? escapeHtml(q.magyarazat) : "";
    const explanationHtml = explanation
      ? (correct && state.mode === "practice"
          ? `<details class="feedback-explanation"><summary>Magyarázat megtekintése</summary><p>${explanation}</p></details>`
          : (!correct ? `<br>${explanation}` : ""))
      : "";
    feedback.innerHTML = `<strong>${correct ? "Helyes válasz." : `Helytelen válasz. A helyes válasz: ${escapeHtml(q.valasz)}.`}</strong>${explanationHtml}`;
  }
  $("#prev-question").disabled = state.currentIndex === 0;
  $("#next-question").textContent = state.currentIndex === total - 1 ? "Eredmény" : "Következő";
}
function chooseAnswer(answer) {
  if (state.finished) return;
  if (state.mode === "practice" && CONFIG.PRACTICE_INSTANT_FEEDBACK && state.answers[state.currentIndex] !== null) return;
  state.answers[state.currentIndex] = answer;
  renderQuestion();
}
function finishSession(timeExpired = false) {
  if (state.finished) return;
  state.finished = true;
  stopTimer();
  const total = state.sessionQuestions.length;
  const correct = state.sessionQuestions.filter((q, i) => state.answers[i] === q.valasz).length;
  const percent = Math.round(correct / total * 100);
  const grade = CONFIG.GRADE_THRESHOLDS.find(g => percent >= g.minPercent) || { label: "Nincs értékelés" };
  $("#result-title").textContent = state.mode === "exam" ? "Vizsgaeredmény" : "Gyakorlás eredménye";
  $("#result-subtitle").textContent = timeExpired ? "Az idő lejárt, a vizsga automatikusan befejeződött." : "A feladatsor kiértékelése elkészült.";
  $("#score-percent").textContent = `${percent}%`;
  $("#score-fraction").textContent = `${correct} / ${total} helyes válasz`;
  $("#grade-label").textContent = `Értékelés: ${grade.label}`;

  const list = $("#review-list");
  list.innerHTML = "";
  state.sessionQuestions.forEach((q, i) => {
    const ok = state.answers[i] === q.valasz;
    const item = document.createElement("article");
    item.className = "review-item";
    item.innerHTML = `<div class="review-meta"><span>${i + 1}. kérdés · ${escapeHtml(q.fejezet)}</span><span class="review-status ${ok ? "good" : "bad"}">${ok ? "Helyes" : "Hibás / kihagyott"}</span></div>
      <p>${escapeHtml(q.kerdes)}</p>
      <p><strong>Válaszod:</strong> ${state.answers[i] ?? "Nem válaszoltál"} · <strong>Helyes:</strong> ${q.valasz}</p>
      ${q.magyarazat ? `<p class="review-explanation">${escapeHtml(q.magyarazat)}</p>` : ""}`;
    list.append(item);
  });
  $("#retry-quiz").textContent = state.mode === "exam" ? "Új vizsga" : "Újrakezdés";
  showScreen(resultScreen);
}

$("#start-exam").addEventListener("click", () => {
  if (state.questions.length) startSession("exam", createExamQuestions());
});
$("#topic-select").addEventListener("change", e => $("#start-practice").disabled = !e.target.value);
$("#start-practice").addEventListener("click", () => {
  const topic = $("#topic-select").value;
  if (topic) startSession("practice", shuffle(state.questions.filter(q => q.fejezet === topic)), topic);
});
document.querySelectorAll(".answer").forEach(button => button.addEventListener("click", () => chooseAnswer(button.dataset.answer)));
$("#prev-question").addEventListener("click", () => {
  if (state.currentIndex > 0) { state.currentIndex--; renderQuestion(); }
});
$("#next-question").addEventListener("click", () => {
  if (state.currentIndex < state.sessionQuestions.length - 1) { state.currentIndex++; renderQuestion(); }
  else finishSession();
});
$("#finish-quiz").addEventListener("click", () => {
  const unanswered = state.answers.filter(a => a === null).length;
  if (unanswered && !confirm(`${unanswered} megválaszolatlan kérdés van. Befejezed a feladatsort?`)) return;
  finishSession();
});
$("#exit-quiz").addEventListener("click", () => {
  if (!confirm("Kilépsz? Az eddigi válaszaid elvesznek.")) return;
  stopTimer(); showScreen(homeScreen);
});
$("#back-home").addEventListener("click", () => showScreen(homeScreen));
$("#retry-quiz").addEventListener("click", () => {
  if (state.mode === "exam") startSession("exam", createExamQuestions());
  else startSession("practice", shuffle(state.questions.filter(q => q.fejezet === state.selectedTopic)), state.selectedTopic);
});
loadQuestions();
