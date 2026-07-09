const STORAGE_KEY = "quiz-studio-paper-v1";
const THEME_KEY = "quiz-studio-theme";
const LANG_KEY = "quiz-studio-language";

const locales = {
  zh: {
    code: "zh-CN",
    name: "中文",
    tagline: "编辑试卷，马上练习",
    aria: {
      mainMode: "主要模式",
      theme: "切换亮色和暗色背景",
      language: "界面语言",
    },
    modes: {
      edit: "编辑",
      quiz: "做题",
    },
    paper: {
      title: "试卷名称",
      description: "说明",
      unnamedPaper: "未命名试卷",
      ready: "准备开始答题。",
    },
    actions: {
      export: "导出",
      import: "导入",
      duplicate: "复制",
      delete: "删除",
      addOption: "添加选项",
      addPair: "添加配对",
      startQuiz: "开始做题",
      backToEdit: "返回编辑",
      quit: "退出",
      submitAnswer: "提交答案",
      viewResults: "查看结果",
      nextQuestion: "下一题",
      retry: "再做一次",
    },
    question: {
      listTitle: "题目",
      emptyList: "还没有题目",
      emptyListHint: "从上方添加一种题型开始",
      chooseOne: "请选择或添加一道题目",
      unnamed: "未命名题目",
      prompt: "题目内容",
      type: "题型",
      option: "选项 {letter}",
      markCorrect: "标记为正确答案",
      acceptedAnswers: "可接受答案",
      caseSensitive: "区分英文大小写",
      correctAnswer: "正确答案",
      leftItem: "左侧项目 {number}",
      rightItem: "右侧答案 {number}",
      yourAnswer: "你的答案",
      choose: "请选择",
      true: "正确",
      false: "错误",
      progress: "第 {current} / {total} 题",
    },
    types: {
      single: "单选题",
      multiple: "多选题",
      blank: "填空题",
      truefalse: "判断题",
      matching: "匹配题",
    },
    shortTypes: {
      single: "单选",
      multiple: "多选",
      blank: "填空",
      truefalse: "判断",
      matching: "匹配",
    },
    result: {
      complete: "答题完成",
      score: "{correct} / {total} 题正确",
      correct: "答对",
      wrong: "答错",
      correctFeedback: "答对了",
      wrongFeedback: "答错了",
      correctAnswer: "正确答案：{answer}",
      acceptedAnswers: "可接受答案：{answers}",
      correctPairs: "正确配对：{pairs}",
      separator: "、",
      pairSeparator: "；",
    },
    toast: {
      noReadyQuestions: "还没有可作答的完整题目，请先检查题目和答案。",
      added: "已添加{type}",
      duplicated: "已复制题目",
      deleted: "已删除题目",
      importSuccess: "导入成功",
      importFail: "导入失败，请选择正确的 JSON 试卷文件。",
      unsupportedLanguage: "暂不支持该语言。",
    },
    samplePaper: {
      title: "第一份 Quiz 试卷",
      description: "这是一份示例试卷。你可以在编辑页替换题目、答案和选项。",
      q1: "下面哪个选项是 JavaScript 中用于声明常量的关键字？",
      q2: "下面哪些题型已经在这个系统第一版中支持？",
      q3: "请输入英文单词 quiz 的中文常见含义。",
      q4: "单选题和多选题在第二次开始做题时可以重新打乱选项顺序。",
      q5: "把题型和它的答题方式匹配起来。",
      autoEssay: "作文自动批改",
      quizMeaning1: "测验",
      quizMeaning2: "小测验",
      judgeWay: "选择正确或错误",
      blankWay: "输入文字答案",
      matchWay: "连接一对一答案",
    },
  },
  en: {
    code: "en",
    name: "English",
    tagline: "Edit papers and practice right away",
    aria: {
      mainMode: "Main mode",
      theme: "Switch light and dark background",
      language: "Interface language",
    },
    modes: {
      edit: "Edit",
      quiz: "Quiz",
    },
    paper: {
      title: "Paper title",
      description: "Description",
      unnamedPaper: "Untitled paper",
      ready: "Ready to start.",
    },
    actions: {
      export: "Export",
      import: "Import",
      duplicate: "Duplicate",
      delete: "Delete",
      addOption: "Add option",
      addPair: "Add pair",
      startQuiz: "Start quiz",
      backToEdit: "Back to edit",
      quit: "Quit",
      submitAnswer: "Submit answer",
      viewResults: "View results",
      nextQuestion: "Next question",
      retry: "Try again",
    },
    question: {
      listTitle: "Questions",
      emptyList: "No questions yet",
      emptyListHint: "Add a question type above",
      chooseOne: "Select or add a question",
      unnamed: "Untitled question",
      prompt: "Question prompt",
      type: "Question type",
      option: "Option {letter}",
      markCorrect: "Mark as correct answer",
      acceptedAnswers: "Accepted answers",
      caseSensitive: "Case-sensitive",
      correctAnswer: "Correct answer",
      leftItem: "Left item {number}",
      rightItem: "Right answer {number}",
      yourAnswer: "Your answer",
      choose: "Choose",
      true: "True",
      false: "False",
      progress: "Question {current} / {total}",
    },
    types: {
      single: "Single choice",
      multiple: "Multiple choice",
      blank: "Blank",
      truefalse: "True/False",
      matching: "Matching",
    },
    shortTypes: {
      single: "Single",
      multiple: "Multiple",
      blank: "Blank",
      truefalse: "Judge",
      matching: "Match",
    },
    result: {
      complete: "Quiz complete",
      score: "{correct} / {total} correct",
      correct: "Correct",
      wrong: "Wrong",
      correctFeedback: "Correct",
      wrongFeedback: "Wrong",
      correctAnswer: "Correct answer: {answer}",
      acceptedAnswers: "Accepted answers: {answers}",
      correctPairs: "Correct pairs: {pairs}",
      separator: ", ",
      pairSeparator: "; ",
    },
    toast: {
      noReadyQuestions: "No complete questions are ready yet. Please check prompts and answers first.",
      added: "Added {type}",
      duplicated: "Question duplicated",
      deleted: "Question deleted",
      importSuccess: "Import complete",
      importFail: "Import failed. Please choose a valid JSON paper file.",
      unsupportedLanguage: "This language is not supported yet.",
    },
    samplePaper: {
      title: "First Quiz Paper",
      description: "This is a sample paper. You can replace questions, answers, and options in the editor.",
      q1: "Which keyword declares a constant in JavaScript?",
      q2: "Which question types are supported in the first version of this system?",
      q3: "Enter a common Chinese meaning of the English word quiz.",
      q4: "Single-choice and multiple-choice options can be shuffled when starting the quiz again.",
      q5: "Match each question type with its answer method.",
      autoEssay: "Automatic essay grading",
      quizMeaning1: "测验",
      quizMeaning2: "小测验",
      judgeWay: "Choose true or false",
      blankWay: "Type a text answer",
      matchWay: "Connect one-to-one answers",
    },
  },
};

let language = loadLanguage();
let paper = loadPaper();
let selectedQuestionId = paper.questions[0]?.id ?? null;
let currentMode = "edit";
let session = null;
let toastTimer = null;

const editorView = document.getElementById("editorView");
const quizView = document.getElementById("quizView");
const editModeButton = document.getElementById("editModeButton");
const quizModeButton = document.getElementById("quizModeButton");
const themeToggle = document.getElementById("themeToggle");
const languageSelect = document.getElementById("languageSelect");
const paperTitle = document.getElementById("paperTitle");
const paperDescription = document.getElementById("paperDescription");
const questionCount = document.getElementById("questionCount");
const questionListTitle = document.getElementById("questionListTitle");
const questionList = document.getElementById("questionList");
const questionEditor = document.getElementById("questionEditor");
const quizPanel = document.getElementById("quizPanel");
const exportButton = document.getElementById("exportButton");
const importInput = document.getElementById("importInput");
const importLabelText = document.getElementById("importLabelText");
const toast = document.getElementById("toast");

init();

function init() {
  document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.lang = locales[language].code;
  bindGlobalEvents();
  renderAll();
}

function bindGlobalEvents() {
  editModeButton.addEventListener("click", () => setMode("edit"));
  quizModeButton.addEventListener("click", () => setMode("quiz"));
  themeToggle.addEventListener("click", toggleTheme);

  languageSelect.addEventListener("change", (event) => {
    setLanguage(event.target.value);
  });

  paperTitle.addEventListener("input", () => {
    paper.title = paperTitle.value;
    savePaper();
  });

  paperDescription.addEventListener("input", () => {
    paper.description = paperDescription.value;
    savePaper();
  });

  document.querySelectorAll("[data-add-type]").forEach((button) => {
    button.addEventListener("click", () => addQuestion(button.dataset.addType));
  });

  exportButton.addEventListener("click", exportPaper);
  importInput.addEventListener("change", importPaper);
}

function renderAll() {
  renderChrome();
  paperTitle.value = paper.title;
  paperDescription.value = paper.description;
  renderQuestionList();
  renderQuestionEditor();
  renderQuizStart();
}

function renderChrome() {
  document.documentElement.lang = locales[language].code;
  document.querySelector(".brand p").textContent = t("tagline");
  document.querySelector(".mode-tabs").setAttribute("aria-label", t("aria.mainMode"));
  editModeButton.textContent = t("modes.edit");
  quizModeButton.textContent = t("modes.quiz");
  themeToggle.title = t("aria.theme");
  themeToggle.setAttribute("aria-label", t("aria.theme"));
  languageSelect.setAttribute("aria-label", t("aria.language"));
  languageSelect.value = language;
  document.querySelector("[data-label='paper-title']").textContent = t("paper.title");
  document.querySelector("[data-label='paper-description']").textContent = t("paper.description");
  questionListTitle.textContent = t("question.listTitle");
  exportButton.textContent = t("actions.export");
  importLabelText.textContent = t("actions.import");

  document.querySelectorAll("[data-add-type]").forEach((button) => {
    button.textContent = typeShortLabel(button.dataset.addType);
  });
}

function setMode(mode) {
  currentMode = mode;
  editorView.classList.toggle("hidden", mode !== "edit");
  quizView.classList.toggle("hidden", mode !== "quiz");
  editModeButton.classList.toggle("active", mode === "edit");
  quizModeButton.classList.toggle("active", mode === "quiz");
  if (mode === "quiz") {
    session = null;
    renderQuizStart();
  }
}

function setLanguage(nextLanguage) {
  if (!locales[nextLanguage]) {
    showToast(t("toast.unsupportedLanguage"));
    languageSelect.value = language;
    return;
  }

  language = nextLanguage;
  localStorage.setItem(LANG_KEY, language);
  renderAll();
}

function renderQuestionList() {
  questionCount.textContent = paper.questions.length;

  if (!paper.questions.length) {
    questionList.innerHTML = `
      <div class="empty-state">
        <div>${t("question.emptyList")}<br>${t("question.emptyListHint")}</div>
      </div>
    `;
    return;
  }

  questionList.innerHTML = paper.questions
    .map((question, index) => {
      const title = question.prompt.trim() || t("question.unnamed");
      return `
        <button class="question-item ${question.id === selectedQuestionId ? "active" : ""}" type="button" data-select-question="${question.id}">
          <span class="question-title">
            <strong>${index + 1}. ${escapeHtml(title)}</strong>
            <span>${typeLabel(question.type)}</span>
          </span>
          <span class="type-pill">${typeShortLabel(question.type)}</span>
        </button>
      `;
    })
    .join("");

  questionList.querySelectorAll("[data-select-question]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedQuestionId = button.dataset.selectQuestion;
      renderQuestionList();
      renderQuestionEditor();
    });
  });
}

function renderQuestionEditor() {
  const question = getSelectedQuestion();

  if (!question) {
    questionEditor.innerHTML = `<div class="empty-state"><div>${t("question.chooseOne")}</div></div>`;
    return;
  }

  questionEditor.innerHTML = `
    <div class="editor-stack">
      <div class="editor-actions">
        <span class="type-pill">${typeLabel(question.type)}</span>
        <div class="row-actions">
          <button class="small-button" type="button" id="duplicateQuestion">${t("actions.duplicate")}</button>
          <button class="danger-button small-button" type="button" id="deleteQuestion">${t("actions.delete")}</button>
        </div>
      </div>

      <div class="editor-heading">
        <div class="field-grid">
          <label>
            <span>${t("question.prompt")}</span>
            <textarea id="questionPrompt" rows="4">${escapeHtml(question.prompt)}</textarea>
          </label>
          <label>
            <span>${t("question.type")}</span>
            <select id="questionType">
              ${Object.keys(locales[language].types).map((value) => `<option value="${value}" ${question.type === value ? "selected" : ""}>${typeLabel(value)}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>

      <div class="answer-section" id="answerEditor">
        ${renderAnswerEditor(question)}
      </div>
    </div>
  `;

  document.getElementById("questionPrompt").addEventListener("input", (event) => {
    question.prompt = event.target.value;
    saveAndRenderList();
  });

  document.getElementById("questionType").addEventListener("change", (event) => {
    convertQuestionType(question, event.target.value);
    savePaper();
    renderAll();
  });

  document.getElementById("duplicateQuestion").addEventListener("click", () => duplicateQuestion(question.id));
  document.getElementById("deleteQuestion").addEventListener("click", () => deleteQuestion(question.id));
  bindAnswerEditor(question);
}

function renderAnswerEditor(question) {
  if (question.type === "single" || question.type === "multiple") {
    const optionRows = question.options
      .map((option, index) => {
        const letter = String.fromCharCode(65 + index);
        return `
          <div class="option-row" data-option-id="${option.id}">
            <label class="correct-toggle" title="${t("question.markCorrect")}">
              <input type="${question.type === "single" ? "radio" : "checkbox"}" name="correctOption" ${option.correct ? "checked" : ""} data-option-correct="${option.id}">
            </label>
            <input type="text" value="${escapeHtml(option.text)}" placeholder="${t("question.option", { letter })}" data-option-text="${option.id}">
            <button class="small-button" type="button" data-delete-option="${option.id}">${t("actions.delete")}</button>
          </div>
        `;
      })
      .join("");

    return `
      ${optionRows}
      <button class="secondary-button" type="button" id="addOption">${t("actions.addOption")}</button>
    `;
  }

  if (question.type === "blank") {
    return `
      <label>
        <span>${t("question.acceptedAnswers")}</span>
        <textarea id="blankAnswers" rows="6">${escapeHtml((question.answers || []).join("\n"))}</textarea>
      </label>
      <label class="inline-check">
        <span>${t("question.caseSensitive")}</span>
        <input id="caseSensitive" type="checkbox" ${question.caseSensitive ? "checked" : ""}>
      </label>
    `;
  }

  if (question.type === "truefalse") {
    return `
      <label>
        <span>${t("question.correctAnswer")}</span>
        <select id="trueFalseAnswer">
          <option value="true" ${question.answer ? "selected" : ""}>${t("question.true")}</option>
          <option value="false" ${!question.answer ? "selected" : ""}>${t("question.false")}</option>
        </select>
      </label>
    `;
  }

  const pairRows = question.pairs
    .map((pair, index) => {
      const number = index + 1;
      return `
        <div class="pair-row" data-pair-id="${pair.id}">
          <input type="text" value="${escapeHtml(pair.left)}" placeholder="${t("question.leftItem", { number })}" data-pair-left="${pair.id}">
          <input type="text" value="${escapeHtml(pair.right)}" placeholder="${t("question.rightItem", { number })}" data-pair-right="${pair.id}">
          <button class="small-button" type="button" data-delete-pair="${pair.id}">${t("actions.delete")}</button>
        </div>
      `;
    })
    .join("");

  return `
    ${pairRows}
    <button class="secondary-button" type="button" id="addPair">${t("actions.addPair")}</button>
  `;
}

function bindAnswerEditor(question) {
  if (question.type === "single" || question.type === "multiple") {
    document.querySelectorAll("[data-option-text]").forEach((input) => {
      input.addEventListener("input", (event) => {
        const option = question.options.find((item) => item.id === input.dataset.optionText);
        option.text = event.target.value;
        savePaper();
      });
    });

    document.querySelectorAll("[data-option-correct]").forEach((input) => {
      input.addEventListener("change", () => {
        if (question.type === "single") {
          question.options.forEach((option) => {
            option.correct = option.id === input.dataset.optionCorrect;
          });
        } else {
          const option = question.options.find((item) => item.id === input.dataset.optionCorrect);
          option.correct = input.checked;
        }
        ensureChoiceValidity(question);
        savePaper();
        renderQuestionEditor();
      });
    });

    document.querySelectorAll("[data-delete-option]").forEach((button) => {
      button.addEventListener("click", () => {
        question.options = question.options.filter((option) => option.id !== button.dataset.deleteOption);
        ensureChoiceValidity(question);
        savePaper();
        renderQuestionEditor();
      });
    });

    document.getElementById("addOption").addEventListener("click", () => {
      question.options.push({ id: makeId(), text: "", correct: question.options.length === 0 });
      savePaper();
      renderQuestionEditor();
    });
    return;
  }

  if (question.type === "blank") {
    document.getElementById("blankAnswers").addEventListener("input", (event) => {
      question.answers = event.target.value.split("\n").map((line) => line.trim()).filter(Boolean);
      savePaper();
    });
    document.getElementById("caseSensitive").addEventListener("change", (event) => {
      question.caseSensitive = event.target.checked;
      savePaper();
    });
    return;
  }

  if (question.type === "truefalse") {
    document.getElementById("trueFalseAnswer").addEventListener("change", (event) => {
      question.answer = event.target.value === "true";
      savePaper();
    });
    return;
  }

  document.querySelectorAll("[data-pair-left]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const pair = question.pairs.find((item) => item.id === input.dataset.pairLeft);
      pair.left = event.target.value;
      savePaper();
    });
  });

  document.querySelectorAll("[data-pair-right]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const pair = question.pairs.find((item) => item.id === input.dataset.pairRight);
      pair.right = event.target.value;
      savePaper();
    });
  });

  document.querySelectorAll("[data-delete-pair]").forEach((button) => {
    button.addEventListener("click", () => {
      question.pairs = question.pairs.filter((pair) => pair.id !== button.dataset.deletePair);
      savePaper();
      renderQuestionEditor();
    });
  });

  document.getElementById("addPair").addEventListener("click", () => {
    question.pairs.push({ id: makeId(), left: "", right: "" });
    savePaper();
    renderQuestionEditor();
  });
}

function renderQuizStart() {
  if (currentMode !== "quiz") return;

  const stats = Object.keys(locales[language].types).map((type) => ({
    type,
    count: paper.questions.filter((question) => question.type === type).length,
  }));

  quizPanel.innerHTML = `
    <div class="quiz-start">
      <div class="quiz-title-block">
        <h2>${escapeHtml(paper.title || t("paper.unnamedPaper"))}</h2>
        <p>${escapeHtml(paper.description || t("paper.ready"))}</p>
      </div>
      <div class="stats-grid">
        ${stats.map((item) => `
          <div class="stat-tile">
            <strong>${item.count}</strong>
            <span>${typeLabel(item.type)}</span>
          </div>
        `).join("")}
      </div>
      <div class="quiz-actions">
        <button class="primary-button" id="startQuiz" type="button" ${paper.questions.length ? "" : "disabled"}>${t("actions.startQuiz")}</button>
        <button class="secondary-button" id="backToEdit" type="button">${t("actions.backToEdit")}</button>
      </div>
    </div>
  `;

  document.getElementById("startQuiz").addEventListener("click", startQuiz);
  document.getElementById("backToEdit").addEventListener("click", () => setMode("edit"));
}

function startQuiz() {
  const validQuestions = paper.questions.filter(isQuestionReady);
  if (!validQuestions.length) {
    showToast(t("toast.noReadyQuestions"));
    return;
  }

  session = {
    questions: validQuestions.map(prepareQuizQuestion),
    index: 0,
    answers: {},
    results: [],
    submitted: false,
    feedback: null,
  };
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  const question = session.questions[session.index];
  const progress = Math.round((session.index / session.questions.length) * 100);

  quizPanel.innerHTML = `
    <div class="quiz-question">
      <div class="progress-line">
        <span>${t("question.progress", { current: session.index + 1, total: session.questions.length })}</span>
        <span>${typeLabel(question.type)}</span>
      </div>
      <div class="progress-track"><div class="progress-bar" style="width: ${progress}%"></div></div>
      <div class="question-prompt">
        <span class="type-pill">${typeLabel(question.type)}</span>
        <h2>${escapeHtml(question.prompt || t("question.unnamed"))}</h2>
      </div>
      ${session.feedback ? renderFeedback(session.feedback) : ""}
      <div class="answer-list">
        ${renderQuizAnswer(question)}
      </div>
      <div class="quiz-actions">
        <button class="secondary-button" type="button" id="quitQuiz">${t("actions.quit")}</button>
        <button class="primary-button" type="button" id="${session.submitted ? "nextQuestion" : "submitAnswer"}">${session.submitted ? nextLabel() : t("actions.submitAnswer")}</button>
      </div>
    </div>
  `;

  bindQuizAnswer(question);
  document.getElementById("quitQuiz").addEventListener("click", renderQuizStart);

  if (session.submitted) {
    document.getElementById("nextQuestion").addEventListener("click", goNextQuestion);
  } else {
    document.getElementById("submitAnswer").addEventListener("click", submitCurrentAnswer);
  }
}

function renderQuizAnswer(question) {
  const answer = session.answers[question.id];

  if (question.type === "single" || question.type === "multiple") {
    return question.options
      .map((option, index) => {
        const checked = question.type === "single"
          ? answer === option.id
          : Array.isArray(answer) && answer.includes(option.id);
        return `
          <label class="choice-line">
            <input type="${question.type === "single" ? "radio" : "checkbox"}" name="choiceAnswer" value="${option.id}" ${checked ? "checked" : ""} ${session.submitted ? "disabled" : ""}>
            <span class="choice-letter">${String.fromCharCode(65 + index)}</span>
            <span>${escapeHtml(option.text)}</span>
          </label>
        `;
      })
      .join("");
  }

  if (question.type === "blank") {
    return `
      <label>
        <span>${t("question.yourAnswer")}</span>
        <input id="blankAnswer" type="text" value="${escapeHtml(answer || "")}" ${session.submitted ? "disabled" : ""}>
      </label>
    `;
  }

  if (question.type === "truefalse") {
    return `
      <label class="judge-line">
        <input type="radio" name="judgeAnswer" value="true" ${answer === true ? "checked" : ""} ${session.submitted ? "disabled" : ""}>
        <span>${t("question.true")}</span>
      </label>
      <label class="judge-line">
        <input type="radio" name="judgeAnswer" value="false" ${answer === false ? "checked" : ""} ${session.submitted ? "disabled" : ""}>
        <span>${t("question.false")}</span>
      </label>
    `;
  }

  return question.pairs
    .map((pair) => `
      <label class="match-line">
        <span>${escapeHtml(pair.left)}</span>
        <select data-match-answer="${pair.id}" ${session.submitted ? "disabled" : ""}>
          <option value="">${t("question.choose")}</option>
          ${question.rightOptions.map((right) => `<option value="${right.id}" ${answer?.[pair.id] === right.id ? "selected" : ""}>${escapeHtml(right.text)}</option>`).join("")}
        </select>
      </label>
    `)
    .join("");
}

function bindQuizAnswer(question) {
  if (session.submitted) return;

  if (question.type === "single") {
    document.querySelectorAll("input[name='choiceAnswer']").forEach((input) => {
      input.addEventListener("change", () => {
        session.answers[question.id] = input.value;
      });
    });
    return;
  }

  if (question.type === "multiple") {
    document.querySelectorAll("input[name='choiceAnswer']").forEach((input) => {
      input.addEventListener("change", () => {
        session.answers[question.id] = Array.from(document.querySelectorAll("input[name='choiceAnswer']:checked")).map((item) => item.value);
      });
    });
    return;
  }

  if (question.type === "blank") {
    document.getElementById("blankAnswer").addEventListener("input", (event) => {
      session.answers[question.id] = event.target.value;
    });
    return;
  }

  if (question.type === "truefalse") {
    document.querySelectorAll("input[name='judgeAnswer']").forEach((input) => {
      input.addEventListener("change", () => {
        session.answers[question.id] = input.value === "true";
      });
    });
    return;
  }

  document.querySelectorAll("[data-match-answer]").forEach((select) => {
    select.addEventListener("change", () => {
      session.answers[question.id] ||= {};
      session.answers[question.id][select.dataset.matchAnswer] = select.value;
    });
  });
}

function submitCurrentAnswer() {
  const question = session.questions[session.index];
  const result = gradeQuestion(question, session.answers[question.id]);
  session.results[session.index] = result;
  session.submitted = true;
  session.feedback = result;
  renderCurrentQuestion();
}

function goNextQuestion() {
  if (session.index >= session.questions.length - 1) {
    renderResults();
    return;
  }

  session.index += 1;
  session.submitted = false;
  session.feedback = null;
  renderCurrentQuestion();
}

function renderResults() {
  const correctCount = session.results.filter((result) => result.correct).length;
  const percent = Math.round((correctCount / session.questions.length) * 100);

  quizPanel.innerHTML = `
    <div class="quiz-start">
      <div class="quiz-title-block">
        <h2>${t("result.complete")}</h2>
        <p>${escapeHtml(paper.title || t("paper.unnamedPaper"))}</p>
      </div>
      <div class="result-score">
        <div>
          <strong>${percent}%</strong>
          <p>${t("result.score", { correct: correctCount, total: session.questions.length })}</p>
        </div>
      </div>
      <div class="review-list">
        ${session.questions.map((question, index) => {
          const result = session.results[index];
          return `
            <div class="review-item ${result.correct ? "correct" : "wrong"}">
              <strong>${index + 1}. ${escapeHtml(question.prompt)}</strong>
              <p class="meta-text">${typeLabel(question.type)} · ${result.correct ? t("result.correct") : t("result.wrong")}</p>
              <p>${escapeHtml(result.detail)}</p>
            </div>
          `;
        }).join("")}
      </div>
      <div class="quiz-actions">
        <button class="secondary-button" id="backToEditorAfterResult" type="button">${t("actions.backToEdit")}</button>
        <button class="primary-button" id="retryQuiz" type="button">${t("actions.retry")}</button>
      </div>
    </div>
  `;

  document.getElementById("backToEditorAfterResult").addEventListener("click", () => setMode("edit"));
  document.getElementById("retryQuiz").addEventListener("click", startQuiz);
}

function renderFeedback(result) {
  return `
    <div class="feedback ${result.correct ? "correct" : "wrong"}">
      <span class="feedback-icon">${result.correct ? "✓" : "×"}</span>
      <div>
        <strong>${result.correct ? t("result.correctFeedback") : t("result.wrongFeedback")}</strong>
        <p>${escapeHtml(result.detail)}</p>
      </div>
    </div>
  `;
}

function gradeQuestion(question, answer) {
  if (question.type === "single") {
    const correctId = question.options.find((option) => option.correct)?.id;
    const correctText = question.options.find((option) => option.id === correctId)?.text || "";
    return {
      correct: answer === correctId,
      detail: t("result.correctAnswer", { answer: correctText }),
    };
  }

  if (question.type === "multiple") {
    const correctIds = question.options.filter((option) => option.correct).map((option) => option.id).sort();
    const answerIds = Array.isArray(answer) ? [...answer].sort() : [];
    const correct = JSON.stringify(correctIds) === JSON.stringify(answerIds);
    const correctText = question.options.filter((option) => option.correct).map((option) => option.text).join(t("result.separator"));
    return {
      correct,
      detail: t("result.correctAnswer", { answer: correctText }),
    };
  }

  if (question.type === "blank") {
    const normalizedAnswer = normalizeText(answer || "", question.caseSensitive);
    const accepted = question.answers.map((item) => normalizeText(item, question.caseSensitive));
    return {
      correct: accepted.includes(normalizedAnswer),
      detail: t("result.acceptedAnswers", { answers: question.answers.join(t("result.separator")) }),
    };
  }

  if (question.type === "truefalse") {
    return {
      correct: answer === question.answer,
      detail: t("result.correctAnswer", { answer: question.answer ? t("question.true") : t("question.false") }),
    };
  }

  const answerMap = answer || {};
  const correct = question.pairs.every((pair) => answerMap[pair.id] === pair.rightId);
  return {
    correct,
    detail: t("result.correctPairs", {
      pairs: question.pairs.map((pair) => `${pair.left} = ${pair.right}`).join(t("result.pairSeparator")),
    }),
  };
}

function prepareQuizQuestion(question) {
  const cloned = structuredClone(question);

  if (cloned.type === "single" || cloned.type === "multiple") {
    cloned.options = shuffle(cloned.options);
  }

  if (cloned.type === "matching") {
    cloned.pairs = cloned.pairs.map((pair) => ({
      id: pair.id,
      left: pair.left,
      right: pair.right,
      rightId: pair.id,
    }));
    cloned.rightOptions = shuffle(cloned.pairs.map((pair) => ({
      id: pair.id,
      text: pair.right,
    })));
  }

  return cloned;
}

function isQuestionReady(question) {
  if (!question.prompt.trim()) return false;
  if (question.type === "single") return question.options.length >= 2 && question.options.some((option) => option.correct && option.text.trim());
  if (question.type === "multiple") return question.options.length >= 2 && question.options.filter((option) => option.correct && option.text.trim()).length >= 1;
  if (question.type === "blank") return question.answers?.some(Boolean);
  if (question.type === "truefalse") return typeof question.answer === "boolean";
  if (question.type === "matching") return question.pairs?.length >= 2 && question.pairs.every((pair) => pair.left.trim() && pair.right.trim());
  return false;
}

function addQuestion(type) {
  const question = createQuestion(type);
  paper.questions.push(question);
  selectedQuestionId = question.id;
  savePaper();
  renderAll();
  showToast(t("toast.added", { type: typeLabel(type) }));
}

function createQuestion(type) {
  const base = { id: makeId(), type, prompt: "" };

  if (type === "single") {
    return {
      ...base,
      options: [
        { id: makeId(), text: "", correct: true },
        { id: makeId(), text: "", correct: false },
        { id: makeId(), text: "", correct: false },
        { id: makeId(), text: "", correct: false },
      ],
    };
  }

  if (type === "multiple") {
    return {
      ...base,
      options: [
        { id: makeId(), text: "", correct: true },
        { id: makeId(), text: "", correct: true },
        { id: makeId(), text: "", correct: false },
        { id: makeId(), text: "", correct: false },
      ],
    };
  }

  if (type === "blank") return { ...base, answers: [""], caseSensitive: false };
  if (type === "truefalse") return { ...base, answer: true };
  return {
    ...base,
    pairs: [
      { id: makeId(), left: "", right: "" },
      { id: makeId(), left: "", right: "" },
    ],
  };
}

function convertQuestionType(question, nextType) {
  const replacement = createQuestion(nextType);
  question.type = nextType;

  delete question.options;
  delete question.answers;
  delete question.caseSensitive;
  delete question.answer;
  delete question.pairs;

  Object.entries(replacement).forEach(([key, value]) => {
    if (key !== "id" && key !== "type" && key !== "prompt") question[key] = value;
  });
}

function duplicateQuestion(id) {
  const index = paper.questions.findIndex((question) => question.id === id);
  const copy = structuredClone(paper.questions[index]);
  copy.id = makeId();
  if (copy.options) copy.options = copy.options.map((option) => ({ ...option, id: makeId() }));
  if (copy.pairs) copy.pairs = copy.pairs.map((pair) => ({ ...pair, id: makeId() }));
  paper.questions.splice(index + 1, 0, copy);
  selectedQuestionId = copy.id;
  savePaper();
  renderAll();
  showToast(t("toast.duplicated"));
}

function deleteQuestion(id) {
  paper.questions = paper.questions.filter((question) => question.id !== id);
  selectedQuestionId = paper.questions[0]?.id ?? null;
  savePaper();
  renderAll();
  showToast(t("toast.deleted"));
}

function ensureChoiceValidity(question) {
  if (!question.options.length) return;
  if (question.type === "single") {
    const selected = question.options.filter((option) => option.correct);
    question.options.forEach((option, index) => {
      option.correct = selected.length ? option.id === selected[0].id : index === 0;
    });
  }
}

function getSelectedQuestion() {
  return paper.questions.find((question) => question.id === selectedQuestionId) || null;
}

function saveAndRenderList() {
  savePaper();
  renderQuestionList();
}

function savePaper() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paper));
}

function loadPaper() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : createDefaultPaper();
  } catch {
    return createDefaultPaper();
  }
}

function createDefaultPaper() {
  const sample = locales[language].samplePaper;
  return {
    title: sample.title,
    description: sample.description,
    questions: [
      {
        id: makeId(),
        type: "single",
        prompt: sample.q1,
        options: [
          { id: makeId(), text: "const", correct: true },
          { id: makeId(), text: "var", correct: false },
          { id: makeId(), text: "function", correct: false },
          { id: makeId(), text: "return", correct: false },
        ],
      },
      {
        id: makeId(),
        type: "multiple",
        prompt: sample.q2,
        options: [
          { id: makeId(), text: typeLabel("single"), correct: true },
          { id: makeId(), text: typeLabel("multiple"), correct: true },
          { id: makeId(), text: typeLabel("blank"), correct: true },
          { id: makeId(), text: sample.autoEssay, correct: false },
        ],
      },
      {
        id: makeId(),
        type: "blank",
        prompt: sample.q3,
        answers: [sample.quizMeaning1, sample.quizMeaning2],
        caseSensitive: false,
      },
      {
        id: makeId(),
        type: "truefalse",
        prompt: sample.q4,
        answer: true,
      },
      {
        id: makeId(),
        type: "matching",
        prompt: sample.q5,
        pairs: [
          { id: makeId(), left: typeLabel("truefalse"), right: sample.judgeWay },
          { id: makeId(), left: typeLabel("blank"), right: sample.blankWay },
          { id: makeId(), left: typeLabel("matching"), right: sample.matchWay },
        ],
      },
    ],
  };
}

function exportPaper() {
  const blob = new Blob([JSON.stringify(paper, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${paper.title || "quiz-paper"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importPaper(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported.questions)) throw new Error("Invalid paper");
      paper = imported;
      selectedQuestionId = paper.questions[0]?.id ?? null;
      savePaper();
      renderAll();
      showToast(t("toast.importSuccess"));
    } catch {
      showToast(t("toast.importFail"));
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
}

function nextLabel() {
  return session.index >= session.questions.length - 1 ? t("actions.viewResults") : t("actions.nextQuestion");
}

function typeLabel(type) {
  return t(`types.${type}`);
}

function typeShortLabel(type) {
  return t(`shortTypes.${type}`);
}

function t(path, params = {}) {
  const value = path.split(".").reduce((current, key) => current?.[key], locales[language]);
  const fallback = path.split(".").reduce((current, key) => current?.[key], locales.zh);
  const template = typeof value === "string" ? value : fallback;
  if (typeof template !== "string") return path;

  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match;
  });
}

function loadLanguage() {
  const saved = localStorage.getItem(LANG_KEY);
  return locales[saved] ? saved : "zh";
}

function normalizeText(value, caseSensitive) {
  const trimmed = String(value).trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}
