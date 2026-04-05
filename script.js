/**
 * ML Question Bank — shared client script
 * Pages: data-page="home" | "quiz" | "result"
 */
(function () {
  "use strict";

  const THEME_KEY = "mlQuizTheme";
  const SETTINGS_KEY = "mlQuizSettings";
  const FILTERED_KEY = "mlQuizFilteredQuestions";
  const RESULTS_KEY = "mlQuizResults";

  const EXAM_SECTION_KEYS = ["A", "B", "C", "D"];
  const FINAL_EXAM_PER_SECTION = 10;
  const FINAL_EXAM_TIMER_SEC = 120 * 60;
  const PRACTICE_DEFAULT_COUNT = 20;
  const PRACTICE_SINGLE_MIN = 10;
  const PRACTICE_SINGLE_MAX = 50;
  const PRACTICE_ALL_MIN = 10;
  const PRACTICE_ALL_MAX = 200;

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function getTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function setTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    localStorage.setItem(THEME_KEY, mode);
  }

  function initTheme() {
    setTheme(getTheme());
    $$(".theme-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        setTheme(next);
      });
    });
  }

  async function loadQuestions() {
    const res = await fetch("questions.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load questions.json");
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("questions.json must be an array");
    return validateQuestions(data);
  }

  function validateQuestions(raw) {
    return raw.filter((q) => {
      if (!q || typeof q !== "object") return false;
      if (typeof q.question !== "string" || !q.question.trim()) return false;
      if (!q.type) q.type = "mcq";
      if (q.type !== "mcq" && q.type !== "self_check") return false;
      if (!Array.isArray(q.options)) q.options = [];
      if (q.type === "mcq" && q.options.length < 2) return false;
      if (typeof q.correct_answer !== "string") q.correct_answer = "";
      if (typeof q.explanation !== "string") q.explanation = "";
      if (q.scored === undefined) q.scored = q.type === "mcq";
      if (!q.difficulty) q.difficulty = "medium";
      if (!q.topic) q.topic = "general";
      if (!q.section) q.section = "";
      if (!q.id) q.id = "";
      return true;
    });
  }

  function norm(s) {
    return String(s).trim().replace(/\s+/g, " ");
  }

  function formatClockSeconds(sec) {
    const t = Math.max(0, Math.floor(sec));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function sectionKey(q) {
    return norm(q.section || "").toUpperCase() || "";
  }

  function questionsInSection(all, sec) {
    const u = norm(sec).toUpperCase();
    return all.filter((q) => sectionKey(q) === u);
  }

  function isFinalExamBankReady(all) {
    return EXAM_SECTION_KEYS.every((s) => questionsInSection(all, s).length >= FINAL_EXAM_PER_SECTION);
  }

  function buildFinalExamSession(allQuestions) {
    const picked = [];
    for (const sec of EXAM_SECTION_KEYS) {
      const pool = questionsInSection(allQuestions, sec);
      const shuffled = shuffleArray(pool);
      picked.push(...shuffled.slice(0, Math.min(FINAL_EXAM_PER_SECTION, shuffled.length)));
    }
    return shuffleArray(picked);
  }

  function buildPracticeSession(allQuestions, settings) {
    let pool = allQuestions.slice();
    if (settings.practiceScope === "single_section" && settings.practiceSection) {
      pool = questionsInSection(allQuestions, settings.practiceSection);
    }
    const raw = parseInt(String(settings.sessionSize ?? String(PRACTICE_DEFAULT_COUNT)), 10);
    const want = Number.isFinite(raw) ? raw : PRACTICE_DEFAULT_COUNT;
    const n = Math.min(want, pool.length);
    return shuffleArray(pool).slice(0, n);
  }

  function filterQuestions(all, { topic, difficulty, searchQuery }) {
    let list = all.slice();
    const t = norm(topic).toLowerCase();
    const d = norm(difficulty).toLowerCase();
    const q = norm(searchQuery).toLowerCase();

    if (t) list = list.filter((x) => norm(x.topic).toLowerCase() === t);
    if (d) list = list.filter((x) => norm(x.difficulty).toLowerCase() === d);
    if (q) {
      list = list.filter((x) => {
        const hay = `${x.id} ${x.question} ${(x.options || []).join(" ")} ${x.topic} ${x.explanation} ${x.section}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }

  /** Fisher–Yates copy */
  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildSessionPool(allQuestions, settings) {
    if (settings.sessionFlow === "final_exam") {
      return buildFinalExamSession(allQuestions);
    }
    if (settings.sessionFlow === "practice") {
      return buildPracticeSession(allQuestions, settings);
    }
    let pool = filterQuestions(allQuestions, settings);
    const raw = parseInt(String(settings.sessionSize ?? "10"), 10);
    const want = Number.isFinite(raw) && raw > 0 ? raw : 10;
    const n = Math.min(want, pool.length);
    if (settings.shuffle !== false) pool = shuffleArray(pool);
    return pool.slice(0, n);
  }

  // ----- Home -----
  async function initHome() {
    const flowFinal = $("#flowFinalExam");
    const flowPractice = $("#flowPractice");
    const setupPhasePick = $("#setupPhasePick");
    const setupPhaseDetails = $("#setupPhaseDetails");
    const setupLoadLine = $("#setupLoadLine");
    const setupModeChoices = $("#setupModeChoices");
    const pickFinalExam = $("#pickFinalExam");
    const pickPractice = $("#pickPractice");
    const changeModeBtn = $("#changeModeBtn");
    const chosenModeLabel = $("#chosenModeLabel");
    const panelFinal = $("#panelFinalExam");
    const panelPractice = $("#panelPractice");
    const practiceScopeSingle = $("#practiceScopeSingle");
    const practiceScopeAll = $("#practiceScopeAll");
    const practiceSectionSelect = $("#practiceSectionSelect");
    const practiceSessionSize = $("#practiceSessionSize");
    const practiceCountHint = $("#practiceCountHint");
    const examPatternToggle = $("#examPatternToggle");
    const autoRevealToggle = $("#autoRevealToggle");
    const hint = $("#questionCountHint");
    const startBtn = $("#startBtn");

    pickFinalExam.disabled = true;
    pickPractice.disabled = true;

    function syncExamAutoRevealUi() {
      const ex = examPatternToggle.checked;
      autoRevealToggle.disabled = ex;
      if (ex) autoRevealToggle.checked = false;
    }

    function isFinalFlow() {
      return flowFinal.checked;
    }

    function hasChosenSessionMode() {
      return flowFinal.checked || flowPractice.checked;
    }

    function syncFlowPanels() {
      const final = isFinalFlow();
      panelFinal.classList.toggle("hidden", !final);
      panelPractice.classList.toggle("hidden", final);
      startBtn.textContent = final ? "Start final exam" : "Start quiz";
    }

    function revealStepDetails() {
      setupPhasePick.classList.add("hidden");
      setupPhaseDetails.classList.remove("hidden");
      syncFlowPanels();
      syncPracticeScopeLimits();
      syncExamAutoRevealUi();
      updateHint();
    }

    function backToStepPick() {
      flowFinal.checked = false;
      flowPractice.checked = false;
      setupPhaseDetails.classList.add("hidden");
      setupPhasePick.classList.remove("hidden");
      hint.textContent = "";
      startBtn.disabled = true;
    }

    function syncPracticeScopeLimits() {
      const single = practiceScopeSingle.checked;
      const inp = practiceSessionSize;
      if (single) {
        inp.min = String(PRACTICE_SINGLE_MIN);
        inp.max = String(PRACTICE_SINGLE_MAX);
        practiceCountHint.textContent =
          "Random sample each time (10–50 for one section). Order is shuffled every session.";
      } else {
        inp.min = String(PRACTICE_ALL_MIN);
        inp.max = String(PRACTICE_ALL_MAX);
        practiceCountHint.textContent =
          "Random mix from the whole bank (10–200). Order is shuffled every session.";
      }
    }

    /** Call when switching single ↔ all; snaps count if out of range (per spec). */
    function clampPracticeCountAfterScopeChange() {
      syncPracticeScopeLimits();
      const single = practiceScopeSingle.checked;
      let v = parseInt(String(practiceSessionSize.value), 10);
      if (!Number.isFinite(v)) v = PRACTICE_DEFAULT_COUNT;
      if (single) {
        if (v > PRACTICE_SINGLE_MAX) practiceSessionSize.value = String(PRACTICE_DEFAULT_COUNT);
        else if (v < PRACTICE_SINGLE_MIN) practiceSessionSize.value = String(PRACTICE_SINGLE_MIN);
      } else {
        if (v > PRACTICE_ALL_MAX) practiceSessionSize.value = String(PRACTICE_ALL_MAX);
        else if (v < PRACTICE_ALL_MIN) practiceSessionSize.value = String(PRACTICE_ALL_MIN);
      }
    }

    function collectSettings() {
      if (isFinalFlow()) {
        return {
          sessionFlow: "final_exam",
          examPattern: true,
          autoRevealOnSelect: false,
          timerEnabled: true,
          timerMode: "countdown",
          timerLimitSec: FINAL_EXAM_TIMER_SEC,
          sessionSize: EXAM_SECTION_KEYS.length * FINAL_EXAM_PER_SECTION,
          shuffle: true,
        };
      }
      syncExamAutoRevealUi();
      const single = practiceScopeSingle.checked;
      return {
        sessionFlow: "practice",
        practiceScope: single ? "single_section" : "all_topics",
        practiceSection: single ? practiceSectionSelect.value : "",
        sessionSize: practiceSessionSize.value,
        timerEnabled: false,
        timerMode: "off",
        examPattern: examPatternToggle.checked,
        autoRevealOnSelect: autoRevealToggle.checked,
        shuffle: true,
      };
    }

    function updateHint() {
      if (!hasChosenSessionMode()) return;

      if (isFinalFlow()) {
        if (!isFinalExamBankReady(allQuestions)) {
          const counts = EXAM_SECTION_KEYS.map((s) => `${s}: ${questionsInSection(allQuestions, s).length}`).join(", ");
          hint.textContent = `Final exam needs at least ${FINAL_EXAM_PER_SECTION} questions in each section (A–D). Current counts: ${counts}.`;
          startBtn.disabled = true;
          return;
        }
        hint.textContent =
          "Ready: 40 questions (10 random from each section A–D), full session shuffled, 2-hour countdown, exam-style feedback until the end.";
        startBtn.disabled = false;
        return;
      }

      const settings = collectSettings();
      let pool = allQuestions.slice();
      if (settings.practiceScope === "single_section" && settings.practiceSection) {
        pool = questionsInSection(allQuestions, settings.practiceSection);
      }
      const poolN = pool.length;
      if (poolN === 0) {
        hint.textContent = "No questions in that section.";
        startBtn.disabled = true;
        return;
      }
      let want = parseInt(String(practiceSessionSize.value), 10);
      if (!Number.isFinite(want)) want = PRACTICE_DEFAULT_COUNT;
      const maxAllowed = practiceScopeSingle.checked ? PRACTICE_SINGLE_MAX : PRACTICE_ALL_MAX;
      const minAllowed = practiceScopeSingle.checked ? PRACTICE_SINGLE_MIN : PRACTICE_ALL_MIN;
      let effMin = minAllowed;
      let effMax = Math.min(maxAllowed, poolN);
      if (poolN < minAllowed) {
        effMin = 1;
        effMax = poolN;
      }
      practiceSessionSize.min = String(effMin);
      practiceSessionSize.max = String(Math.max(effMin, effMax));
      if (want > effMax) {
        want = effMax;
        practiceSessionSize.value = String(effMax);
      }
      if (want < effMin) {
        want = effMin;
        practiceSessionSize.value = String(effMin);
      }
      const take = Math.min(want, poolN);
      if (want > poolN) practiceSessionSize.value = String(poolN);
      const scored = pool.filter((x) => x.scored !== false && x.type === "mcq").length;
      const selfc = pool.length - scored;
      hint.textContent = `${poolN} question${poolN === 1 ? "" : "s"} in pool (${scored} auto-scored MCQ, ${selfc} self-check). This session: ${take} drawn at random, shuffled.`;
      startBtn.disabled = take < 1;
    }

    let allQuestions = [];
    try {
      allQuestions = await loadQuestions();
    } catch (e) {
      setupLoadLine.textContent = "Error loading questions: " + e.message;
      pickFinalExam.disabled = true;
      pickPractice.disabled = true;
      return;
    }

    setupLoadLine.classList.add("hidden");
    setupModeChoices.classList.remove("hidden");
    setupModeChoices.removeAttribute("aria-hidden");
    pickFinalExam.disabled = false;
    pickPractice.disabled = false;

    practiceSectionSelect.innerHTML = "";
    EXAM_SECTION_KEYS.forEach((sec) => {
      const first = allQuestions.find((q) => sectionKey(q) === sec);
      const opt = document.createElement("option");
      opt.value = sec;
      opt.textContent = first ? first.topic : `Section ${sec}`;
      practiceSectionSelect.appendChild(opt);
    });

    pickFinalExam.addEventListener("click", () => {
      flowFinal.checked = true;
      flowPractice.checked = false;
      chosenModeLabel.textContent = "Selected: Final exam mode";
      revealStepDetails();
    });

    pickPractice.addEventListener("click", () => {
      flowPractice.checked = true;
      flowFinal.checked = false;
      chosenModeLabel.textContent = "Selected: Practice mode";
      revealStepDetails();
    });

    changeModeBtn.addEventListener("click", () => {
      backToStepPick();
    });

    practiceScopeSingle.addEventListener("change", () => {
      clampPracticeCountAfterScopeChange();
      $("#practiceSectionField").classList.remove("hidden");
      updateHint();
    });
    practiceScopeAll.addEventListener("change", () => {
      clampPracticeCountAfterScopeChange();
      $("#practiceSectionField").classList.add("hidden");
      updateHint();
    });
    practiceSectionSelect.addEventListener("change", updateHint);
    practiceSessionSize.addEventListener("input", updateHint);
    practiceSessionSize.addEventListener("change", updateHint);
    examPatternToggle.addEventListener("change", () => {
      syncExamAutoRevealUi();
      updateHint();
    });
    autoRevealToggle.addEventListener("change", updateHint);

    startBtn.disabled = true;

    startBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!hasChosenSessionMode()) return;
      const settings = collectSettings();
      if (settings.sessionFlow === "final_exam") {
        if (!isFinalExamBankReady(allQuestions)) return;
      } else {
        let pool = allQuestions.slice();
        if (settings.practiceScope === "single_section" && settings.practiceSection) {
          pool = questionsInSection(allQuestions, settings.practiceSection);
        }
        if (pool.length === 0) return;
      }
      const session = buildSessionPool(allQuestions, settings);
      if (!session.length) return;
      sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      sessionStorage.setItem(FILTERED_KEY, JSON.stringify(session));
      window.location.href = "quiz.html";
    });
  }

  // ----- Quiz -----
  function initQuiz() {
    const raw = sessionStorage.getItem(FILTERED_KEY);
    if (!raw) {
      window.location.href = "index.html";
      return;
    }

    let questions;
    try {
      questions = JSON.parse(raw);
    } catch {
      window.location.href = "index.html";
      return;
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      window.location.href = "index.html";
      return;
    }

    let quizFinished = false;

    let settings = {};
    try {
      settings = JSON.parse(sessionStorage.getItem(SETTINGS_KEY) || "{}");
    } catch {
      /* ignore */
    }

    const examPattern = !!settings.examPattern;
    const autoRevealOnSelect = !!settings.autoRevealOnSelect && !examPattern;

    const scoreChip = $("#scoreChip");
    const examBadge = $("#examBadge");
    if (examPattern) {
      scoreChip.classList.add("hidden");
      examBadge.classList.remove("hidden");
    }

    const timerEnabled = !!settings.timerEnabled;
    const timerMode = settings.timerMode || (timerEnabled ? "countup" : "off");
    const timerLimitSec =
      typeof settings.timerLimitSec === "number" && settings.timerLimitSec > 0
        ? settings.timerLimitSec
        : FINAL_EXAM_TIMER_SEC;
    const countdownActive = timerEnabled && timerMode === "countdown";

    const timerEl = $("#timerDisplay");
    if (timerEnabled) {
      timerEl.classList.remove("hidden");
      timerEl.classList.toggle("timer-countdown", countdownActive);
      timerEl.setAttribute("aria-live", "polite");
    }

    let startTime = Date.now();
    let timerId = null;
    if (countdownActive) {
      const endAt = startTime + timerLimitSec * 1000;
      const tick = () => {
        const left = Math.ceil((endAt - Date.now()) / 1000);
        timerEl.textContent = formatClockSeconds(left);
        if (left <= 0) {
          if (timerId) clearInterval(timerId);
          timerId = null;
          finishQuiz();
        }
      };
      tick();
      timerId = setInterval(tick, 500);
    } else if (timerEnabled) {
      timerId = setInterval(() => {
        const sec = Math.floor((Date.now() - startTime) / 1000);
        timerEl.textContent = formatClockSeconds(sec);
      }, 1000);
    }

    let index = 0;
    /** @type {{ selected: string, submitted: boolean, isCorrect: boolean }[]} */
    const state = questions.map(() => ({ selected: "", submitted: false, isCorrect: false }));
    let score = 0;

    function isSelfCheck(q) {
      return q.type === "self_check";
    }

    const progressText = $("#progressText");
    const progressFill = $("#progressFill");
    const progressTrack = $(".progress-track");
    const topicBadge = $("#topicBadge");
    const qTopic = $("#qTopic");
    const qDifficulty = $("#qDifficulty");
    const questionText = $("#questionText");
    const optionsList = $("#optionsList");
    const prevBtn = $("#prevBtn");
    const submitBtn = $("#submitBtn");
    const nextBtn = $("#nextBtn");
    const feedbackPanel = $("#feedbackPanel");
    const feedbackVerdict = $("#feedbackVerdict");
    const explanationText = $("#explanationText");
    const scoreLive = $("#scoreLive");
    const card = $("#questionCard");

    function setProgress() {
      const total = questions.length;
      const pct = total ? ((index + 1) / total) * 100 : 0;
      progressText.textContent = `Question ${index + 1} of ${total}`;
      progressFill.style.width = `${pct}%`;
      progressTrack.setAttribute("aria-valuenow", String(Math.round(pct)));
    }

    function render() {
      const q = questions[index];
      const st = state[index];
      const selfQ = isSelfCheck(q);
      const exam = examPattern;
      const autoReveal = autoRevealOnSelect;

      topicBadge.textContent = q.id ? q.id : settings.topic ? settings.topic : "Mixed";
      qTopic.textContent = q.topic;
      qDifficulty.textContent = q.difficulty;
      qDifficulty.className = "badge badge-diff " + norm(q.difficulty).toLowerCase();

      questionText.textContent = q.question;
      questionText.classList.toggle("pre-wrap", selfQ || q.question.length > 240);

      optionsList.innerHTML = "";
      if (selfQ) {
        const li = document.createElement("li");
        li.className = "option-item";
        const hint = document.createElement("div");
        hint.className = "self-check-hint muted";
        hint.innerHTML = exam
          ? "<strong>Written / practical item.</strong> Work it on paper; <strong>no model answer or feedback</strong> until you finish. Use <strong>Next</strong> when you want to continue."
          : "<strong>Written / practical item.</strong> Draft your answer on paper, then reveal the <strong>model answer</strong> below to self-mark.";
        li.appendChild(hint);
        optionsList.appendChild(li);
      } else {
        q.options.forEach((opt) => {
          const li = document.createElement("li");
          li.className = "option-item";
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "option-btn";
          btn.textContent = opt;
          btn.dataset.value = opt;
          const showGradedMcq = st.submitted && !exam;
          if (showGradedMcq) {
            btn.disabled = true;
            if (norm(opt) === norm(q.correct_answer)) btn.classList.add("correct");
            else if (norm(opt) === norm(st.selected) && !st.isCorrect) btn.classList.add("wrong");
          } else {
            if (st.selected && norm(opt) === norm(st.selected)) btn.classList.add("selected");
            btn.addEventListener("click", () => {
              if (st.submitted && !exam) return;
              $$(".option-btn", optionsList).forEach((b) => b.classList.remove("selected"));
              btn.classList.add("selected");
              st.selected = opt;
              if (autoReveal && !st.submitted) {
                st.submitted = true;
                st.isCorrect = norm(opt) === norm(q.correct_answer);
                if (st.isCorrect && q.scored !== false) score += 1;
              }
              if (!autoReveal) submitBtn.disabled = !st.selected || st.submitted;
              render();
            });
          }
          li.appendChild(btn);
          optionsList.appendChild(li);
        });
      }

      prevBtn.disabled = index === 0;

      if (selfQ) {
        if (exam) {
          submitBtn.classList.add("hidden");
          nextBtn.classList.remove("hidden");
          nextBtn.disabled = false;
          feedbackPanel.classList.add("hidden");
        } else {
          submitBtn.textContent = "Show model answer";
          submitBtn.disabled = st.submitted;
          submitBtn.classList.toggle("hidden", st.submitted);
          nextBtn.classList.toggle("hidden", !st.submitted);
          feedbackPanel.classList.toggle("hidden", !st.submitted);
        }
      } else if (exam) {
        submitBtn.classList.add("hidden");
        nextBtn.classList.toggle("hidden", !st.selected);
        nextBtn.disabled = false;
        feedbackPanel.classList.add("hidden");
      } else {
        submitBtn.textContent = "Check answer";
        submitBtn.disabled = !st.selected || st.submitted;
        submitBtn.classList.toggle("hidden", st.submitted || autoReveal);
        nextBtn.classList.toggle("hidden", !st.submitted);
        feedbackPanel.classList.toggle("hidden", !st.submitted);
      }

      nextBtn.textContent =
        index >= questions.length - 1 ? "Finish & see results" : "Next";

      if (st.submitted && !exam) {
        if (selfQ) {
          feedbackVerdict.textContent = "Model answer — compare with your work.";
          feedbackVerdict.className = "feedback-verdict ok";
        } else {
          feedbackVerdict.textContent = st.isCorrect ? "Correct — well done." : "Not quite — see below.";
          feedbackVerdict.className = "feedback-verdict " + (st.isCorrect ? "ok" : "bad");
        }
        explanationText.textContent = q.explanation || "No explanation provided.";
      }

      if (!exam) scoreLive.textContent = String(score);
      setProgress();
    }

    function animateCard() {
      card.classList.remove("fade-in");
      void card.offsetWidth;
      card.classList.add("fade-in");
    }

    submitBtn.addEventListener("click", () => {
      const st = state[index];
      const q = questions[index];
      if (examPattern) return;
      if (st.submitted) return;
      if (isSelfCheck(q)) {
        st.submitted = true;
        st.isCorrect = false;
        render();
        return;
      }
      if (!st.selected) return;
      st.submitted = true;
      st.isCorrect = norm(st.selected) === norm(q.correct_answer);
      if (st.isCorrect && q.scored !== false) score += 1;
      render();
    });

    function applyExamMcqGrades() {
      if (!examPattern) return;
      score = 0;
      questions.forEach((q, i) => {
        const st = state[i];
        if (q.type !== "mcq" || q.scored === false) return;
        st.submitted = true;
        st.isCorrect = !!st.selected && norm(st.selected) === norm(q.correct_answer);
        if (st.isCorrect) score += 1;
      });
    }

    nextBtn.addEventListener("click", () => {
      if (examPattern && isSelfCheck(questions[index]) && !state[index].submitted) {
        state[index].submitted = true;
        state[index].isCorrect = false;
      }
      if (index >= questions.length - 1) {
        finishQuiz();
        return;
      }
      card.classList.add("fade-out");
      setTimeout(() => {
        index += 1;
        card.classList.remove("fade-out");
        render();
        animateCard();
      }, 200);
    });

    prevBtn.addEventListener("click", () => {
      if (index <= 0) return;
      card.classList.add("fade-out");
      setTimeout(() => {
        index -= 1;
        card.classList.remove("fade-out");
        render();
        animateCard();
      }, 200);
    });

    function finishQuiz() {
      if (quizFinished) return;
      quizFinished = true;
      if (timerId) clearInterval(timerId);
      if (examPattern) {
        const q = questions[index];
        if (isSelfCheck(q) && !state[index].submitted) {
          state[index].submitted = true;
          state[index].isCorrect = false;
        }
        applyExamMcqGrades();
      }
      const timeMs = Date.now() - startTime;
      const totalScored = questions.filter((q) => q.scored !== false && q.type === "mcq").length;
      const results = {
        questionIds: questions.map((q) => q.id),
        questionMeta: questions.map((q) => ({
          id: q.id,
          type: q.type,
          topic: q.topic,
          difficulty: q.difficulty,
          scored: q.scored !== false,
        })),
        state: state.map((s, i) => ({
          selected: s.selected,
          submitted: s.submitted,
          isCorrect: s.isCorrect,
          correct_answer: questions[i].correct_answer,
        })),
        score,
        total: questions.length,
        totalScored,
        timeMs,
        settings,
      };
      try {
        sessionStorage.setItem(RESULTS_KEY, JSON.stringify(results));
      } catch (err) {
        console.warn("sessionStorage full, trimming", err);
        results.state = results.state.map((row) => ({
          selected: row.selected,
          submitted: row.submitted,
          isCorrect: row.isCorrect,
          correct_answer: norm(row.correct_answer).slice(0, 500),
        }));
        sessionStorage.setItem(RESULTS_KEY, JSON.stringify(results));
      }
      window.location.href = "result.html";
    }

    render();
    animateCard();
  }

  // ----- Result -----
  async function initResult() {
    const raw = sessionStorage.getItem(RESULTS_KEY);
    if (!raw) {
      window.location.href = "index.html";
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      window.location.href = "index.html";
      return;
    }

    let questions = [];
    const state = data.state || [];
    if (Array.isArray(data.questionIds) && data.questionIds.length === state.length) {
      try {
        const bank = await loadQuestions();
        const byId = new Map(bank.map((q) => [q.id, q]));
        questions = data.questionIds.map((id) => byId.get(id));
        if (!questions.every(Boolean)) questions = [];
      } catch (e) {
        console.warn("Could not reload questions.json for review", e);
        questions = [];
      }
    }
    if (questions.length !== state.length && Array.isArray(data.questions) && data.questions.length === state.length) {
      questions = data.questions;
    }
    if (questions.length !== state.length && Array.isArray(data.questionMeta) && data.questionMeta.length === state.length) {
      questions = data.questionMeta.map((m, i) => ({
        id: m.id,
        type: m.type,
        topic: m.topic,
        difficulty: m.difficulty,
        scored: m.scored,
        question: `${m.id} — open the app over http://localhost or GitHub Pages to load full text from questions.json.`,
        options: [],
        correct_answer: state[i].correct_answer || "",
        explanation:
          "Full model answers live in questions.json. Use: python -m http.server (from the quiz folder), then refresh this results page.",
      }));
    }

    const { score, total, timeMs } = data;
    let correct = 0;
    let wrong = 0;
    let practice = 0;
    questions.forEach((q, i) => {
      if (!q || !state[i]) return;
      const st = state[i];
      if (q.type === "self_check") {
        if (st.submitted) practice += 1;
        return;
      }
      if (q.scored === false) return;
      if (!st.submitted) return;
      if (st.isCorrect) correct += 1;
      else wrong += 1;
    });
    const totalScored =
      data.totalScored ??
      questions.filter((q) => q && q.type === "mcq" && q.scored !== false).length;
    const pct = totalScored ? Math.round((correct / totalScored) * 100) : 0;

    $("#correctCount").textContent = String(correct);
    $("#wrongCount").textContent = String(wrong);
    $("#practiceCount").textContent = String(practice);
    $("#mcqTotal").textContent = String(totalScored);
    $("#scorePercent").textContent = totalScored ? `${pct}%` : "—";

    const sec = Math.floor((timeMs || 0) / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    $("#timeElapsed").textContent = `${m}:${String(s).padStart(2, "0")}`;

    const ring = $("#scoreRing");
    const circumference = 2 * Math.PI * 52;
    ring.style.strokeDasharray = String(circumference);
    ring.style.strokeDashoffset = String(
      circumference * (1 - (totalScored ? pct / 100 : 0))
    );

    const reviewList = $("#reviewList");
    reviewList.innerHTML = "";

    if (questions.length !== state.length) {
      const warn = document.createElement("p");
      warn.className = "muted";
      warn.style.marginBottom = "1rem";
      warn.innerHTML =
        "Full review needs <code>questions.json</code> (serve the site over <strong>http://</strong> or GitHub Pages, not <code>file://</code>). Showing what we could recover.";
      reviewList.appendChild(warn);
    }

    questions.forEach((q, i) => {
      const st = state[i];
      if (!q || !st) return;
      const details = document.createElement("details");
      details.className = "review-item";
      const summary = document.createElement("summary");
      summary.className = "review-summary";
      const status = document.createElement("span");
      const label = q.id || `Q${i + 1}`;
      if (q.type === "self_check") {
        status.className = "review-status practice";
        status.textContent = st.submitted ? "Self-check ✓" : "Skipped";
      } else {
        status.className = "review-status " + (st.isCorrect ? "ok" : "bad");
        status.textContent = !st.submitted ? "—" : st.isCorrect ? "Correct" : "Wrong";
      }
      const qspan = document.createElement("span");
      qspan.className = "review-q";
      qspan.textContent = `${label}. ${q.question.slice(0, 220)}${q.question.length > 220 ? "…" : ""}`;
      summary.appendChild(status);
      summary.appendChild(qspan);

      const body = document.createElement("div");
      body.className = "review-body";
      if (q.type === "self_check") {
        body.innerHTML = `
        <p><strong>Section:</strong> ${escapeHtml(q.topic)}</p>
        <p class="pre-wrap"><strong>Model answer / notes:</strong><br>${escapeHtml(q.explanation || "")}</p>
      `;
      } else {
        body.innerHTML = `
        <p><strong>Your answer:</strong> ${escapeHtml(st.selected || "—")}</p>
        <p><strong>Correct answer:</strong> ${escapeHtml(q.correct_answer)}</p>
        <p><strong>Topic:</strong> ${escapeHtml(q.topic)} · <strong>Difficulty:</strong> ${escapeHtml(q.difficulty)}</p>
        <p class="pre-wrap">${escapeHtml(q.explanation || "")}</p>
      `;
      }
      details.appendChild(summary);
      details.appendChild(body);
      reviewList.appendChild(details);
    });

    $("#retrySameBtn").addEventListener("click", async (e) => {
      e.preventDefault();
      const settings = data.settings || {};
      try {
        const bank = await loadQuestions();
        const session = buildSessionPool(bank, settings);
        sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        sessionStorage.setItem(FILTERED_KEY, JSON.stringify(session));
      } catch {
        if (settings) sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        sessionStorage.setItem(FILTERED_KEY, JSON.stringify(questions));
      }
      window.location.href = "quiz.html";
    });
  }

  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    const page = document.body.getAttribute("data-page");
    if (page === "home") initHome();
    else if (page === "quiz") initQuiz();
    else if (page === "result") void initResult();
  });
})();
